# apps/worker/tests/test_persist.py
from datetime import datetime, timezone
from uuid import UUID

import asyncpg
import pytest

from tcabr_worker.config import settings
from tcabr_worker.persist import persist_snapshot


@pytest.fixture
async def pool() -> asyncpg.Pool:
    p = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    async with p.acquire() as c:
        await c.execute("delete from repo where owner='persisttest'")
        await c.execute("delete from stargazer_profile where username like 'persist_%'")
    yield p
    await p.close()


@pytest.mark.asyncio
async def test_persist_snapshot_writes_repo_and_snapshot(pool: asyncpg.Pool) -> None:
    # Seed one stargazer_profile so FK holds.
    async with pool.acquire() as c:
        await c.execute(
            "insert into stargazer_profile(username, joined_at) values('persist_u1', $1)",
            datetime(2025, 1, 1, tzinfo=timezone.utc),
        )
    snap = {
        "repo": {"owner": "persisttest", "name": "demo", "star_count": 1},
        "anomaly_score": 42, "score_ci_low": 30, "score_ci_high": 55,
        "sample_size": 1, "stargazer_total": 1, "is_full_population": True,
        "feature_breakdown": {"new_account": 1},
        "star_timeseries": [{"date": "2025-06-01", "n": 1}],
        "burst_windows": [],
        "classifications": [{
            "username": "persist_u1",
            "anomaly_score": 42,
            "feature_hits": [{"id": "new_account", "triggered": True, "weight": 3}],
            "starred_at": "2025-06-01T00:00:00+00:00",
        }],
    }
    snapshot_id = await persist_snapshot(pool, snap)
    assert UUID(str(snapshot_id))

    async with pool.acquire() as c:
        cls = await c.fetch(
            "select username, anomaly_score from stargazer_classification where snapshot_id=$1",
            snapshot_id,
        )
    assert len(cls) == 1 and cls[0]["username"] == "persist_u1"
