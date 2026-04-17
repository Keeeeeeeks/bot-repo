from __future__ import annotations

from functools import partial
from typing import Any

from .db import get_pool
from .exclusions import load_excluded
from .github import GitHubClient
from .models import ScanRequest
from .persist import persist_snapshot
from .pipeline import run_scan
from .profile_cache import get_cached, upsert_profile


async def scan_repo(
    ctx: dict,
    owner: str,
    name: str,
    user_token: str | None = None,
) -> dict[str, Any]:
    pool = await get_pool()
    async with GitHubClient(token=user_token) as gh:
        # Collect all stargazer events first so we can do a single exclusion query.
        events = [e async for e in gh.iter_stargazers(owner, name)]
        excluded = await load_excluded(pool, [e.username for e in events])

        # Wrap the real gh client to replay the already-fetched event list.
        class _PreFetchedGH:
            async def fetch_repo_meta(self, o: str, n: str):
                return await gh.fetch_repo_meta(o, n)

            def iter_stargazers(self, o: str, n: str, **kw):
                async def _gen():
                    for ev in events:
                        yield ev
                return _gen()

            async def fetch_user_profile(self, u: str):
                return await gh.fetch_user_profile(u)

            async def count_recent_public_commits(self, u: str, days: int = 60) -> int:
                return await gh.count_recent_public_commits(u, days)

            async def count_starred_repos(self, u: str) -> int:
                return await gh.count_starred_repos(u)

        snap = await run_scan(
            ScanRequest(owner=owner, name=name, user_token=user_token),
            gh=_PreFetchedGH(),
            get_cached=partial(_cached, pool),
            upsert_profile=partial(_upsert, pool),
            excluded=excluded,
        )
    snapshot_id = await persist_snapshot(pool, snap)
    return {"snapshot_id": str(snapshot_id), "anomaly_score": snap["anomaly_score"]}


async def _cached(pool, username):
    return await get_cached(pool, username, ttl_days=7)


async def _upsert(pool, profile):
    return await upsert_profile(pool, profile)
