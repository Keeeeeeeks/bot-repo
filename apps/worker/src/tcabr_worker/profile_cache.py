from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import asyncpg

from .models import UserProfile


async def get_cached(pool: asyncpg.Pool, username: str, ttl_days: int) -> UserProfile | None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=ttl_days)
    async with pool.acquire() as c:
        row = await c.fetchrow(
            """
            select username, joined_at, followers, following, public_repos,
                   recent_commits_60d, raw, cached_at
            from stargazer_profile
            where username = $1 and cached_at >= $2
            """,
            username,
            cutoff,
        )
    if row is None:
        return None
    raw = row["raw"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    return UserProfile(
        username=row["username"],
        joined_at=row["joined_at"],
        followers=row["followers"],
        following=row["following"],
        public_repos=row["public_repos"],
        recent_commits_60d=row["recent_commits_60d"],
        bio=raw.get("bio"),
        avatar_is_default=raw.get("_avatar_default", False),
        raw=raw,
    )


async def upsert_profile_unless_excluded(
    pool: asyncpg.Pool, p: UserProfile
) -> None:
    async with pool.acquire() as c:
        excluded = await c.fetchval(
            "select 1 from user_exclusion where gh_username = $1", p.username
        )
    if excluded:
        return
    await upsert_profile(pool, p)


async def upsert_profile(pool: asyncpg.Pool, p: UserProfile) -> None:
    raw = dict(p.raw)
    raw["_avatar_default"] = p.avatar_is_default
    raw.setdefault("bio", p.bio)
    async with pool.acquire() as c:
        await c.execute(
            """
            insert into stargazer_profile
              (username, joined_at, followers, following, public_repos,
               recent_commits_60d, raw, cached_at)
            values ($1,$2,$3,$4,$5,$6,$7::jsonb,now())
            on conflict (username) do update set
              joined_at          = excluded.joined_at,
              followers          = excluded.followers,
              following          = excluded.following,
              public_repos       = excluded.public_repos,
              recent_commits_60d = excluded.recent_commits_60d,
              raw                = excluded.raw,
              cached_at          = now()
            """,
            p.username,
            p.joined_at,
            p.followers,
            p.following,
            p.public_repos,
            p.recent_commits_60d,
            json.dumps(raw),
        )
