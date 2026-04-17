from __future__ import annotations

import re

from .base import FeatureContext, register

_PATTERNS = [
    re.compile(r"^[a-z]+-[a-z]+-\d{3,}$"),        # firstname-lastname-1234
    re.compile(r"^[a-z]{3,}\d{6,}$"),             # worddddd123456
    re.compile(r"^user\d{4,}$"),                  # user0000
]


class BotUsername:
    id = "bot_username"

    def triggered(self, ctx: FeatureContext) -> bool:
        u = ctx.profile.username.lower()
        return any(p.match(u) for p in _PATTERNS)


register(BotUsername())
