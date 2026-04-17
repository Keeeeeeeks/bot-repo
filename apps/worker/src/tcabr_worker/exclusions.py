from __future__ import annotations

import asyncpg


async def load_excluded(pool: asyncpg.Pool, usernames: list[str]) -> set[str]:
    if not usernames:
        return set()
    async with pool.acquire() as c:
        rows = await c.fetch(
            "select gh_username from user_exclusion where gh_username = any($1::text[])",
            usernames,
        )
    return {r["gh_username"] for r in rows}
