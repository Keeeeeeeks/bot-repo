from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from ..models import StargazerEvent, UserProfile
from ..weights import WEIGHTS, FeatureId


@dataclass(frozen=True)
class FeatureContext:
    """Data visible to every feature classifier when scoring one stargazer."""

    profile: UserProfile
    event: StargazerEvent
    repo_burst_windows: list[tuple[datetime, datetime]]


class FeatureClassifier(Protocol):
    id: FeatureId

    def triggered(self, ctx: FeatureContext) -> bool: ...


_REGISTRY: dict[FeatureId, FeatureClassifier] = {}


def register(classifier: FeatureClassifier) -> FeatureClassifier:
    _REGISTRY[classifier.id] = classifier
    return classifier


def registry() -> dict[FeatureId, FeatureClassifier]:
    return dict(_REGISTRY)


def weight_for(fid: FeatureId) -> int:
    for f in WEIGHTS["features"]:
        if f["id"] == fid:
            return int(f["weight"])
    raise KeyError(fid)
