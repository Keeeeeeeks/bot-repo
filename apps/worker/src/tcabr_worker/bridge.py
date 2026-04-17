"""Bridge: drains tcabr:scan:requests (pushed by Next.js) into arq.enqueue_job.

Runs as a sidecar coroutine on worker startup so Next.js can use a simple JSON
envelope instead of pickle-serializing arq messages in Node.
"""
from __future__ import annotations

import asyncio
import json

import structlog
from arq.connections import ArqRedis, create_pool, RedisSettings
from redis.asyncio import Redis

from .config import settings

log = structlog.get_logger()

REQUEST_QUEUE = "tcabr:scan:requests"
STATUS_KEY_PREFIX = "tcabr:scan:status:"


async def run_bridge() -> None:
    arq: ArqRedis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    raw: Redis = Redis.from_url(settings.redis_url, decode_responses=True)
    log.info("bridge.started")
    while True:
        popped = await raw.brpop(REQUEST_QUEUE, timeout=5)
        if popped is None:
            continue
        _, payload = popped
        env = json.loads(payload)
        job_id = env["job_id"]
        await raw.set(
            f"{STATUS_KEY_PREFIX}{job_id}",
            json.dumps({"state": "running", "updated_at": _now()}),
            ex=60 * 60,
        )
        try:
            job = await arq.enqueue_job(
                "scan_repo", env["owner"], env["name"], env.get("user_token")
            )
            assert job is not None
            result = await job.result(timeout=60 * 30)
            await raw.set(
                f"{STATUS_KEY_PREFIX}{job_id}",
                json.dumps({
                    "state": "done",
                    "snapshot_id": result["snapshot_id"],
                    "updated_at": _now(),
                }),
                ex=60 * 60 * 24,
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("bridge.job_failed", err=str(exc))
            await raw.set(
                f"{STATUS_KEY_PREFIX}{job_id}",
                json.dumps({"state": "error", "error": str(exc), "updated_at": _now()}),
                ex=60 * 60,
            )


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    asyncio.run(run_bridge())
