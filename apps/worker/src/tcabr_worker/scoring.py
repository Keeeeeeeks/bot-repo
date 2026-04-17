from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

from .features import registry, weight_for
from .features.base import FeatureContext
from .weights import WEIGHTS


@dataclass(frozen=True)
class FeatureHitResult:
    id: str
    triggered: bool
    weight: int


@dataclass(frozen=True)
class UserScore:
    username: str
    score: int
    feature_hits: list[FeatureHitResult]


@dataclass(frozen=True)
class RepoAggregate:
    mean: int
    ci_low: int
    ci_high: int


def score_user(ctx: FeatureContext) -> UserScore:
    raw = 0
    hits: list[FeatureHitResult] = []
    for fid, cls in registry().items():
        triggered = cls.triggered(ctx)
        w = weight_for(fid)
        if triggered:
            raw += w
        hits.append(FeatureHitResult(id=fid, triggered=triggered, weight=w))
    max_raw = WEIGHTS["normalization"]["max_raw"]
    scale = WEIGHTS["normalization"]["scale"]
    normalized = round(scale * raw / max_raw) if max_raw else 0
    return UserScore(username=ctx.profile.username, score=normalized, feature_hits=hits)


def repo_aggregate(scores: Sequence[int], bootstrap: int = 2000, seed: int = 1) -> RepoAggregate:
    """Mean anomaly score with a 95% bootstrap CI.

    `scores` is the list of per-user normalized (0-100) scores for the scanned sample.
    """
    if not scores:
        return RepoAggregate(mean=0, ci_low=0, ci_high=0)
    arr = np.asarray(scores, dtype=float)
    rng = np.random.default_rng(seed)
    n = len(arr)
    means = np.empty(bootstrap)
    for i in range(bootstrap):
        idx = rng.integers(0, n, size=n)
        means[i] = arr[idx].mean()
    lo, hi = np.percentile(means, [2.5, 97.5])
    return RepoAggregate(mean=round(float(arr.mean())), ci_low=round(float(lo)), ci_high=round(float(hi)))
