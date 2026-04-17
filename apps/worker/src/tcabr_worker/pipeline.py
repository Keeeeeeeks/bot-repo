from __future__ import annotations

from collections import Counter
from typing import Any, Awaitable, Callable, Protocol

import structlog

from .burst import detect_burst_windows
from .config import settings
from .features import FeatureContext, registry
from .models import RepoMeta, ScanRequest, StargazerEvent, UserProfile
from .sampler import sample_stargazers
from .scoring import repo_aggregate, score_user

log = structlog.get_logger()


class _GH(Protocol):
    async def fetch_repo_meta(self, owner: str, name: str) -> RepoMeta: ...
    def iter_stargazers(self, owner: str, name: str): ...
    async def fetch_user_profile(self, username: str) -> UserProfile: ...
    async def count_recent_public_commits(self, username: str, days: int = 60) -> int: ...
    async def count_starred_repos(self, username: str) -> int: ...


GetCached = Callable[[str], Awaitable[UserProfile | None]]
UpsertProfile = Callable[[UserProfile], Awaitable[None]]


async def _resolve_profile(
    gh: _GH, username: str, get_cached: GetCached, upsert_profile: UpsertProfile
) -> UserProfile:
    cached = await get_cached(username)
    if cached is not None:
        return cached
    p = await gh.fetch_user_profile(username)
    p = p.model_copy(update={
        "recent_commits_60d": await gh.count_recent_public_commits(username, 60),
        "starred_repos_count": await gh.count_starred_repos(username),
    })
    await upsert_profile(p)
    return p


async def run_scan(
    req: ScanRequest,
    *,
    gh: _GH,
    get_cached: Callable[[str], Awaitable[UserProfile | None]],
    upsert_profile: Callable[[UserProfile], Awaitable[None]],
    sample_threshold: int | None = None,
    sample_size: int | None = None,
) -> dict[str, Any]:
    """Execute a full scan and return a snapshot dict ready for DB write."""
    threshold = sample_threshold or settings.sample_threshold
    size = sample_size or settings.sample_size_default

    meta = await gh.fetch_repo_meta(req.owner, req.name)
    log.info("scan.start", repo=req.repo_slug, star_count=meta.star_count)

    all_events: list[StargazerEvent] = [e async for e in gh.iter_stargazers(req.owner, req.name)]
    sample, is_full = sample_stargazers(all_events, threshold, size, seed=hash(req.repo_slug) % (2**32))

    # Repo-level pre-pass — burst windows computed on the FULL event set.
    burst_windows = detect_burst_windows(all_events, bucket_hours=24, z_threshold=3.0)
    burst_tuples = [(w.start, w.end) for w in burst_windows]

    # Resolve profiles (cache-first) and score each sampled stargazer.
    hits_count: Counter[str] = Counter()
    per_user_scores: list[int] = []
    classifications: list[dict[str, Any]] = []

    # Initialize breakdown keys from registry so every feature shows up even if 0.
    for fid in registry().keys():
        hits_count.setdefault(fid, 0)

    for ev in sample:
        profile = await _resolve_profile(gh, ev.username, get_cached, upsert_profile)
        ctx = FeatureContext(profile=profile, event=ev, repo_burst_windows=burst_tuples)
        us = score_user(ctx)
        per_user_scores.append(us.score)
        for h in us.feature_hits:
            if h.triggered:
                hits_count[h.id] += 1
        classifications.append({
            "username": profile.username,
            "anomaly_score": us.score,
            "feature_hits": [
                {"id": h.id, "triggered": h.triggered, "weight": h.weight}
                for h in us.feature_hits
            ],
            "starred_at": ev.starred_at.isoformat(),
        })

    agg = repo_aggregate(per_user_scores)

    timeseries: list[dict[str, Any]] = [
        {"date": ev.starred_at.date().isoformat(), "n": 1}
        for ev in all_events
    ]
    # Collapse by date
    collapsed: Counter[str] = Counter()
    for row in timeseries:
        collapsed[row["date"]] += 1
    timeseries = [{"date": d, "n": n} for d, n in sorted(collapsed.items())]

    return {
        "repo": {"owner": meta.owner, "name": meta.name, "star_count": meta.star_count},
        "anomaly_score": agg.mean,
        "score_ci_low": agg.ci_low,
        "score_ci_high": agg.ci_high,
        "sample_size": len(sample),
        "stargazer_total": len(all_events),
        "is_full_population": is_full,
        "feature_breakdown": dict(hits_count),
        "star_timeseries": timeseries,
        "burst_windows": [w.model_dump(mode="json") for w in burst_windows],
        "classifications": classifications,
    }
