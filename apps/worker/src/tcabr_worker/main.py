from __future__ import annotations

from arq.connections import RedisSettings

from .config import settings
from .sentry import init_sentry


async def startup(ctx: dict) -> None:
    init_sentry()
    ctx["started"] = True


async def shutdown(ctx: dict) -> None:
    pass


async def health(ctx: dict) -> dict[str, str]:
    return {"status": "ok"}


class WorkerSettings:
    functions = [health]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 4
