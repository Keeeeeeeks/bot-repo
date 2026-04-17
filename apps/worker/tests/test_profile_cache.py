from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from tcabr_worker.config import settings
from tcabr_worker.models import UserProfile
from tcabr_worker.profile_cache import get_cached, upsert_profile


@pytest.fixture
async def pool() -> asyncpg.Pool:
    p = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    async with p.acquire() as c:
        await c.execute("delete from stargazer_profile where username like 'testuser_%'")
    yield p
    await p.close()


@pytest.mark.asyncio
async def test_cache_miss_returns_none(pool: asyncpg.Pool) -> None:
    got = await get_cached(pool, "testuser_missing", ttl_days=7)
    assert got is None


@pytest.mark.asyncio
async def test_upsert_then_hit(pool: asyncpg.Pool) -> None:
    p = UserProfile(
        username="testuser_hit",
        joined_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        followers=3,
        following=2,
        public_repos=5,
        recent_commits_60d=10,
        raw={"note": "test"},
    )
    await upsert_profile(pool, p)
    got = await get_cached(pool, "testuser_hit", ttl_days=7)
    assert got is not None and got.username == "testuser_hit" and got.followers == 3


@pytest.mark.asyncio
async def test_stale_cache_returns_none(pool: asyncpg.Pool) -> None:
    p = UserProfile(
        username="testuser_stale",
        joined_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
    )
    await upsert_profile(pool, p)
    async with pool.acquire() as c:
        await c.execute(
            "update stargazer_profile set cached_at=$1 where username='testuser_stale'",
            datetime.now(timezone.utc) - timedelta(days=8),
        )
    got = await get_cached(pool, "testuser_stale", ttl_days=7)
    assert got is None
