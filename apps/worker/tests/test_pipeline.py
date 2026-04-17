from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from tcabr_worker.models import RepoMeta, ScanRequest, StargazerEvent, UserProfile
from tcabr_worker.pipeline import run_scan


def _stargazer(i: int) -> StargazerEvent:
    return StargazerEvent(
        username=f"u{i}",
        starred_at=datetime(2025, 6, 1, tzinfo=timezone.utc) + timedelta(minutes=i),
    )


def _profile(i: int) -> UserProfile:
    return UserProfile(
        username=f"u{i}",
        joined_at=datetime.now(timezone.utc) - timedelta(days=30),  # all "new accounts" (<180d)
        followers=0, following=0, public_repos=0, recent_commits_60d=0,
        bio=None, avatar_is_default=True, starred_repos_count=0,
    )


@pytest.mark.asyncio
async def test_run_scan_produces_snapshot_dict() -> None:
    gh = MagicMock()
    gh.fetch_repo_meta = AsyncMock(return_value=RepoMeta(owner="x", name="y", star_count=3, default_branch="main"))

    async def gen():
        for i in range(3):
            yield _stargazer(i)
    gh.iter_stargazers = lambda *a, **kw: gen()
    gh.fetch_user_profile = AsyncMock(side_effect=lambda u: _profile(int(u[1:])))
    gh.count_recent_public_commits = AsyncMock(return_value=0)
    gh.count_starred_repos = AsyncMock(return_value=0)

    snap = await run_scan(
        ScanRequest(owner="x", name="y"),
        gh=gh,
        get_cached=AsyncMock(return_value=None),
        upsert_profile=AsyncMock(),
        sample_threshold=5000,
        sample_size=2000,
    )

    assert snap["repo"] == {"owner": "x", "name": "y", "star_count": 3}
    assert snap["sample_size"] == 3
    assert snap["stargazer_total"] == 3
    assert snap["anomaly_score"] > 0  # all "new, empty" profiles trigger features
    assert len(snap["classifications"]) == 3
    assert snap["feature_breakdown"]["new_account"] == 3
