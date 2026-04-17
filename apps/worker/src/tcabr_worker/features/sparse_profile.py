from __future__ import annotations

from .base import FeatureContext, register


class SparseProfile:
    id = "sparse_profile"

    def triggered(self, ctx: FeatureContext) -> bool:
        empty_bio = not (ctx.profile.bio and ctx.profile.bio.strip())
        return empty_bio and ctx.profile.avatar_is_default


register(SparseProfile())
