from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .base import FeatureContext, register


class NewAccount:
    id = "new_account"

    def triggered(self, ctx: FeatureContext) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(days=180)
        return ctx.profile.joined_at >= cutoff


register(NewAccount())
