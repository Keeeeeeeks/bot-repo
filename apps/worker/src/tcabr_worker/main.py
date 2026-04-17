from __future__ import annotations

from arq.connections import RedisSettings

from .config import settings
from .db import close_pool
from .jobs import scan_repo
from .log import configure_logging
from .sentry import init_sentry


async def startup(ctx: dict) -> None:
    configure_logging()
    init_sentry()
    ctx["started"] = True


async def shutdown(ctx: dict) -> None:
    await close_pool()


async def health(ctx: dict) -> dict[str, str]:
    return {"status": "ok"}


class WorkerSettings:
    functions = [health, scan_repo]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 4
    job_timeout = 60 * 30  # 30 min cap for large scans
