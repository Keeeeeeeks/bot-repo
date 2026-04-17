from __future__ import annotations

from functools import partial
from typing import Any

from .db import get_pool
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
        snap = await run_scan(
            ScanRequest(owner=owner, name=name, user_token=user_token),
            gh=gh,
            get_cached=partial(_cached, pool),
            upsert_profile=partial(_upsert, pool),
        )
    snapshot_id = await persist_snapshot(pool, snap)
    return {"snapshot_id": str(snapshot_id), "anomaly_score": snap["anomaly_score"]}


async def _cached(pool, username):
    return await get_cached(pool, username, ttl_days=7)


async def _upsert(pool, profile):
    return await upsert_profile(pool, profile)
