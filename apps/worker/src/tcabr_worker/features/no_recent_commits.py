from __future__ import annotations

from .base import FeatureContext, register


class NoRecentCommits:
    id = "no_recent_commits"

    def triggered(self, ctx: FeatureContext) -> bool:
        return ctx.profile.recent_commits_60d == 0


register(NoRecentCommits())
