from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

import httpx
import structlog

from .config import settings
from .models import RepoMeta, StargazerEvent, UserProfile

log = structlog.get_logger()

GH_BASE = "https://api.github.com"
STAR_ACCEPT = "application/vnd.github.v3.star+json"


class GitHubRateLimited(Exception):
    def __init__(self, reset_at: datetime):
        self.reset_at = reset_at
        super().__init__(f"rate limited until {reset_at.isoformat()}")


class GitHubClient:
    def __init__(self, token: str | None):
        self._token = token or settings.github_fallback_token
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "GitHubClient":
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "tcabr/0.1"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        self._client = httpx.AsyncClient(
            base_url=GH_BASE, headers=headers, timeout=30.0
        )
        return self

    async def __aexit__(self, *a: object) -> None:
        if self._client:
            await self._client.aclose()

    async def _get(self, path: str, headers: dict | None = None, params: dict | None = None) -> httpx.Response:
        assert self._client is not None
        resp = await self._client.get(path, headers=headers, params=params)
        if resp.status_code == 403 and resp.headers.get("x-ratelimit-remaining") == "0":
            reset = int(resp.headers.get("x-ratelimit-reset", "0"))
            raise GitHubRateLimited(datetime.fromtimestamp(reset, tz=timezone.utc))
        resp.raise_for_status()
        return resp

    async def fetch_repo_meta(self, owner: str, name: str) -> RepoMeta:
        r = await self._get(f"/repos/{owner}/{name}")
        j = r.json()
        return RepoMeta(
            owner=j["owner"]["login"],
            name=j["name"],
            star_count=j["stargazers_count"],
            default_branch=j["default_branch"],
        )

    async def iter_stargazers(
        self, owner: str, name: str, max_pages: int | None = None, per_page: int = 100
    ) -> AsyncIterator[StargazerEvent]:
        page = 1
        while True:
            r = await self._get(
                f"/repos/{owner}/{name}/stargazers",
                headers={"Accept": STAR_ACCEPT},
                params={"page": page, "per_page": per_page},
            )
            items = r.json()
            if not items:
                return
            for it in items:
                yield StargazerEvent(
                    username=it["user"]["login"],
                    starred_at=it["starred_at"],
                )
            if max_pages is not None and page >= max_pages:
                return
            if len(items) < per_page:
                return
            page += 1
            await asyncio.sleep(0)

    async def fetch_user_profile(self, username: str) -> UserProfile:
        r = await self._get(f"/users/{username}")
        j = r.json()
        avatar = j.get("avatar_url", "")
        default_avatar = "gravatar" in avatar or "identicons" in avatar
        return UserProfile(
            username=j["login"],
            joined_at=datetime.fromisoformat(j["created_at"].replace("Z", "+00:00")),
            followers=int(j.get("followers", 0)),
            following=int(j.get("following", 0)),
            public_repos=int(j.get("public_repos", 0)),
            bio=j.get("bio"),
            avatar_is_default=default_avatar,
            raw=j,
        )

    async def count_recent_public_commits(self, username: str, days: int = 60) -> int:
        """Approximates public commit count from the /users/:u/events/public feed.

        Only PushEvent entries within `days` are counted. GitHub caps this feed at ~300 events,
        which is fine for heuristic purposes.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        total = 0
        for page in range(1, 4):  # up to 300 events
            r = await self._get(
                f"/users/{username}/events/public", params={"page": page, "per_page": 100}
            )
            items = r.json()
            if not items:
                break
            for e in items:
                ts = datetime.fromisoformat(e["created_at"].replace("Z", "+00:00"))
                if ts < cutoff:
                    return total
                if e.get("type") == "PushEvent":
                    total += int(e.get("payload", {}).get("size", 0))
            if len(items) < 100:
                break
        return total

    async def count_starred_repos(self, username: str) -> int:
        r = await self._get(f"/users/{username}/starred", params={"per_page": 1})
        link = r.headers.get("link", "")
        m = re.search(r'page=(\d+)>; rel="last"', link)
        if m:
            return int(m.group(1))
        return len(r.json())
