from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg


async def persist_snapshot(pool: asyncpg.Pool, snap: dict[str, Any]) -> UUID:
    async with pool.acquire() as c, c.transaction():
        repo_id = await c.fetchval(
            """
            insert into repo (owner, name, star_count, last_scanned_at)
            values ($1, $2, $3, now())
            on conflict (owner, name) do update
              set star_count = excluded.star_count,
                  last_scanned_at = now()
            returning id
            """,
            snap["repo"]["owner"],
            snap["repo"]["name"],
            snap["repo"]["star_count"],
        )
        snapshot_id: UUID = await c.fetchval(
            """
            insert into repo_snapshot
              (repo_id, anomaly_score, score_ci_low, score_ci_high,
               sample_size, stargazer_total, feature_breakdown, star_timeseries, burst_windows)
            values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
            returning id
            """,
            repo_id,
            snap["anomaly_score"],
            snap["score_ci_low"],
            snap["score_ci_high"],
            snap["sample_size"],
            snap["stargazer_total"],
            json.dumps(snap["feature_breakdown"]),
            json.dumps(snap["star_timeseries"]),
            json.dumps(snap["burst_windows"]),
        )
        for cls in snap["classifications"]:
            await c.execute(
                """
                insert into stargazer_classification
                  (snapshot_id, username, anomaly_score, feature_hits, starred_at)
                values ($1,$2,$3,$4::jsonb,$5)
                on conflict (snapshot_id, username) do nothing
                """,
                snapshot_id,
                cls["username"],
                cls["anomaly_score"],
                json.dumps(cls["feature_hits"]),
                datetime.fromisoformat(cls["starred_at"]),
            )
        return snapshot_id
