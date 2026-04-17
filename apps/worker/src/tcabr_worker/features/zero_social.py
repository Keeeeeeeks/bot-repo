from __future__ import annotations

from .base import FeatureContext, register


class ZeroSocial:
    id = "zero_social"

    def triggered(self, ctx: FeatureContext) -> bool:
        return ctx.profile.followers == 0 and ctx.profile.following == 0


register(ZeroSocial())
