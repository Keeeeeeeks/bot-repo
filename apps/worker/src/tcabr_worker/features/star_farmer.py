from __future__ import annotations

from .base import FeatureContext, register

MIN_STARS = 50
RATIO_THRESHOLD = 10.0


class StarFarmer:
    id = "star_farmer"

    def triggered(self, ctx: FeatureContext) -> bool:
        s = ctx.profile.starred_repos_count
        r = ctx.profile.public_repos
        if s < MIN_STARS:
            return False
        # Avoid div-by-zero; treat 0-repo users as "infinite ratio" if they star a lot.
        if r == 0:
            return True
        return (s / r) >= RATIO_THRESHOLD


register(StarFarmer())
