import pytest
import asyncpg

from tcabr_worker.config import settings
from tcabr_worker.exclusions import load_excluded


@pytest.fixture
async def pool() -> asyncpg.Pool:
    p = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    async with p.acquire() as c:
        await c.execute("delete from user_exclusion where gh_username like 'excl_%'")
        await c.execute("insert into user_exclusion(gh_username) values('excl_a'), ('excl_b')")
    yield p
    await p.close()


@pytest.mark.asyncio
async def test_load_excluded_intersects(pool: asyncpg.Pool) -> None:
    got = await load_excluded(pool, ["excl_a", "excl_c", "excl_b", "unrelated"])
    assert got == {"excl_a", "excl_b"}


@pytest.mark.asyncio
async def test_load_excluded_empty(pool: asyncpg.Pool) -> None:
    assert await load_excluded(pool, []) == set()
