import os

import sentry_sdk

from .config import settings


def _before_send(event, hint):
    req = event.get("request") or {}
    # Drop any stray tokens
    for key in ("cookies", "headers"):
        if key in req and isinstance(req[key], dict):
            for k in list(req[key].keys()):
                if k.lower() in {"authorization", "cookie"}:
                    req[key].pop(k, None)
    return event


def init_sentry() -> None:
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.1,
            release=os.getenv("SENTRY_RELEASE"),
            send_default_pii=False,
            before_send=_before_send,
        )
