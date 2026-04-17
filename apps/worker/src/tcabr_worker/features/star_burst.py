from __future__ import annotations

from .base import FeatureContext, register


class StarBurst:
    id = "star_burst"

    def triggered(self, ctx: FeatureContext) -> bool:
        t = ctx.event.starred_at
        return any(start <= t <= end for start, end in ctx.repo_burst_windows)


register(StarBurst())
