# TCABR Plan 2 — Scan + Scoring Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless Python worker that turns a `(owner, repo)` input into a persisted `repo_snapshot` with per-stargazer classifications — the whole heuristic pipeline, end to end, testable in isolation.

**Architecture:** An `arq` job (`scan_repo`) orchestrates: (1) fetch repo metadata + stargazers with `starred_at` via GitHub REST v3, (2) sample down to 2,000 if total > 5,000, (3) resolve each stargazer profile through a 7-day Postgres cache or live API call, (4) **run repo-level pre-passes (burst-window detection) before per-user scoring**, (5) apply heuristic features per user, (6) aggregate into a repo anomaly score with bootstrap 95% CI, (7) write snapshot + classifications. Each feature lives in its own module so it can be unit-tested and re-weighted cheaply. `vcrpy` records real GitHub responses once, then replays them in CI.

**Tech Stack:** Python 3.12, `httpx` (async), `asyncpg`, `arq`, `pydantic` v2, `pytest-asyncio`, `vcrpy`, `numpy` (bootstrap CI).

---

## File Structure

New files created by this plan (under `apps/worker/`):

```
src/tcabr_worker/
  github.py                  # GitHub API client (paginated, token-aware, rate-limit-aware)
  sampler.py                 # Random sample with deterministic seed
  models.py                  # Pydantic DTOs for repo, stargazer, snapshot
  profile_cache.py           # 7-day TTL upsert against stargazer_profile
  burst.py                   # Repo-level burst-window pre-pass
  features/
    __init__.py
    base.py                  # FeatureClassifier protocol + registry
    new_account.py
    no_recent_commits.py
    zero_social.py
    sparse_profile.py
    star_farmer.py
    bot_username.py
    star_burst.py            # Per-user wrapper around repo-level burst windows
  scoring.py                 # Per-user weighted sum + repo aggregate w/ bootstrap CI
  pipeline.py                # Orchestrator (the scan_repo job body)
  jobs.py                    # arq job registration
tests/
  fixtures/
    vcr_cassettes/           # vcrpy cassettes (gitignored except for tiny ones)
    sample_profiles.json
    sample_stargazers.json
  test_github.py
  test_sampler.py
  test_profile_cache.py
  test_burst.py
  test_features/
    test_new_account.py
    test_no_recent_commits.py
    test_zero_social.py
    test_sparse_profile.py
    test_star_farmer.py
    test_bot_username.py
    test_star_burst.py
  test_scoring.py
  test_pipeline.py
```

Modifies `apps/worker/src/tcabr_worker/main.py` to register the new `scan_repo` function.

---

## Task 1: Pydantic models

**Files:**
- Create: `apps/worker/src/tcabr_worker/models.py`
- Test: `apps/worker/tests/test_models.py`

- [ ] **Step 1: Write failing test `apps/worker/tests/test_models.py`**

```python
from datetime import datetime, timezone

from tcabr_worker.models import (
    BurstWindow,
    RepoMeta,
    ScanRequest,
    StargazerEvent,
    UserProfile,
)


def test_scan_request_parses() -> None:
    r = ScanRequest(owner="vercel", name="next.js", user_token=None)
    assert r.repo_slug == "vercel/next.js"


def test_stargazer_event_accepts_iso_timestamp() -> None:
    ev = StargazerEvent(username="octocat", starred_at="2025-12-01T10:00:00Z")
    assert ev.starred_at.tzinfo is timezone.utc


def test_user_profile_defaults() -> None:
    p = UserProfile(username="ghost", joined_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert p.followers == 0 and p.following == 0


def test_burst_window_roundtrip() -> None:
    w = BurstWindow(start="2025-12-01T00:00:00Z", end="2025-12-01T06:00:00Z", z_score=4.1)
    assert w.end > w.start


def test_repo_meta_counts() -> None:
    r = RepoMeta(owner="x", name="y", star_count=123, default_branch="main")
    assert r.star_count == 123
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/worker && .venv/bin/pytest tests/test_models.py -v
```

Expected: `ModuleNotFoundError: tcabr_worker.models`.

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/models.py`**

```python
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    owner: str
    name: str
    user_token: str | None = None

    @property
    def repo_slug(self) -> str:
        return f"{self.owner}/{self.name}"


class RepoMeta(BaseModel):
    owner: str
    name: str
    star_count: int
    default_branch: str


class StargazerEvent(BaseModel):
    username: str
    starred_at: datetime


class UserProfile(BaseModel):
    username: str
    joined_at: datetime
    followers: int = 0
    following: int = 0
    public_repos: int = 0
    recent_commits_60d: int = 0
    bio: str | None = None
    avatar_is_default: bool = False
    starred_repos_count: int = 0
    raw: dict = Field(default_factory=dict)


class BurstWindow(BaseModel):
    start: datetime
    end: datetime
    z_score: float
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
.venv/bin/pytest tests/test_models.py -v
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/models.py apps/worker/tests/test_models.py
git commit -m "feat(worker): pydantic models for scan pipeline"
```

---

## Task 2: GitHub API client

**Files:**
- Create: `apps/worker/src/tcabr_worker/github.py`
- Test: `apps/worker/tests/test_github.py`
- Create: `apps/worker/tests/fixtures/vcr_cassettes/` (dir)

- [ ] **Step 1: Write failing test `apps/worker/tests/test_github.py`**

```python
from datetime import datetime, timezone

import pytest
import vcr

from tcabr_worker.github import GitHubClient

cassette = vcr.VCR(
    cassette_library_dir="tests/fixtures/vcr_cassettes",
    record_mode="none",
    filter_headers=["authorization"],
)


@pytest.mark.asyncio
@cassette.use_cassette("repo_meta_vercel_next.yaml")
async def test_fetch_repo_meta() -> None:
    async with GitHubClient(token=None) as gh:
        meta = await gh.fetch_repo_meta("vercel", "next.js")
    assert meta.owner == "vercel"
    assert meta.star_count > 100_000


@pytest.mark.asyncio
@cassette.use_cassette("stargazers_small.yaml")
async def test_paginated_stargazers_with_timestamps() -> None:
    async with GitHubClient(token=None) as gh:
        events = [e async for e in gh.iter_stargazers("octocat", "hello-world", max_pages=2)]
    assert len(events) > 0
    assert all(e.starred_at.tzinfo is timezone.utc for e in events)


@pytest.mark.asyncio
@cassette.use_cassette("user_profile_octocat.yaml")
async def test_fetch_user_profile() -> None:
    async with GitHubClient(token=None) as gh:
        p = await gh.fetch_user_profile("octocat")
    assert p.username == "octocat"
    assert p.joined_at < datetime.now(timezone.utc)


@pytest.mark.asyncio
@cassette.use_cassette("recent_events_octocat.yaml")
async def test_recent_commit_count() -> None:
    async with GitHubClient(token=None) as gh:
        n = await gh.count_recent_public_commits("octocat", days=60)
    assert n >= 0
```

- [ ] **Step 2: Run to confirm failure (module not found)**

```bash
cd apps/worker && .venv/bin/pytest tests/test_github.py -v
```

Expected: import error.

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/github.py`**

```python
from __future__ import annotations

import asyncio
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
        default_avatar = "gravatar" in avatar or avatar.endswith("?v=4") is False and "identicons" in avatar
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
        import re

        m = re.search(r'page=(\d+)>; rel="last"', link)
        if m:
            return int(m.group(1))
        return len(r.json())
```

- [ ] **Step 4: Record VCR cassettes (one-time, requires network)**

Run this helper manually on a dev machine with a GitHub token exported:

```bash
export GITHUB_FALLBACK_TOKEN=<your token>
cd apps/worker
.venv/bin/python - <<'PY'
import asyncio, vcr
from tcabr_worker.github import GitHubClient

v = vcr.VCR(cassette_library_dir="tests/fixtures/vcr_cassettes",
            record_mode="new_episodes", filter_headers=["authorization"])

async def record():
    async with GitHubClient(token=None) as gh:
        with v.use_cassette("repo_meta_vercel_next.yaml"):
            await gh.fetch_repo_meta("vercel", "next.js")
        with v.use_cassette("stargazers_small.yaml"):
            _ = [e async for e in gh.iter_stargazers("octocat", "hello-world", max_pages=2)]
        with v.use_cassette("user_profile_octocat.yaml"):
            await gh.fetch_user_profile("octocat")
        with v.use_cassette("recent_events_octocat.yaml"):
            await gh.count_recent_public_commits("octocat", 60)
asyncio.run(record())
PY
unset GITHUB_FALLBACK_TOKEN
```

Expected: four `.yaml` cassettes appear under `tests/fixtures/vcr_cassettes/`.

- [ ] **Step 5: Run tests against recorded cassettes**

```bash
.venv/bin/pytest tests/test_github.py -v
```

Expected: 4 pass.

- [ ] **Step 6: Commit (include cassettes — they are small and stable)**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/github.py apps/worker/tests/test_github.py apps/worker/tests/fixtures/
git commit -m "feat(worker): GitHub client with VCR-recorded tests"
```

---

## Task 3: Sampler

**Files:**
- Create: `apps/worker/src/tcabr_worker/sampler.py`
- Test: `apps/worker/tests/test_sampler.py`

- [ ] **Step 1: Write failing test `apps/worker/tests/test_sampler.py`**

```python
from tcabr_worker.sampler import sample_stargazers
from tcabr_worker.models import StargazerEvent
from datetime import datetime, timezone


def _ev(n: int) -> StargazerEvent:
    return StargazerEvent(username=f"u{n}", starred_at=datetime(2025, 1, 1, tzinfo=timezone.utc))


def test_no_sample_when_below_threshold() -> None:
    events = [_ev(i) for i in range(100)]
    out, full = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    assert out == events and full is True


def test_sample_when_above_threshold() -> None:
    events = [_ev(i) for i in range(6000)]
    out, full = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    assert len(out) == 2000 and full is False
    usernames = {e.username for e in out}
    assert len(usernames) == 2000  # no duplicates


def test_sample_is_deterministic_with_seed() -> None:
    events = [_ev(i) for i in range(10000)]
    a, _ = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    b, _ = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    assert [e.username for e in a] == [e.username for e in b]
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/worker && .venv/bin/pytest tests/test_sampler.py -v
```

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/sampler.py`**

```python
from __future__ import annotations

import random
from typing import Sequence

from .models import StargazerEvent


def sample_stargazers(
    events: Sequence[StargazerEvent],
    threshold: int,
    size: int,
    seed: int,
) -> tuple[list[StargazerEvent], bool]:
    """Returns (sample, is_full_population).

    If len(events) <= threshold, returns all events and full=True.
    Otherwise returns a random sample of `size` events, seeded deterministically.
    """
    if len(events) <= threshold:
        return list(events), True
    rng = random.Random(seed)
    return rng.sample(list(events), size), False
```

- [ ] **Step 4: Run tests**

```bash
.venv/bin/pytest tests/test_sampler.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/sampler.py apps/worker/tests/test_sampler.py
git commit -m "feat(worker): deterministic stargazer sampler"
```

---

## Task 4: Profile cache

**Files:**
- Create: `apps/worker/src/tcabr_worker/profile_cache.py`
- Test: `apps/worker/tests/test_profile_cache.py`

- [ ] **Step 1: Write failing test `apps/worker/tests/test_profile_cache.py`**

```python
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from tcabr_worker.config import settings
from tcabr_worker.models import UserProfile
from tcabr_worker.profile_cache import get_cached, upsert_profile


@pytest.fixture
async def pool() -> asyncpg.Pool:
    p = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    async with p.acquire() as c:
        await c.execute("delete from stargazer_profile where username like 'testuser_%'")
    yield p
    await p.close()


@pytest.mark.asyncio
async def test_cache_miss_returns_none(pool: asyncpg.Pool) -> None:
    got = await get_cached(pool, "testuser_missing", ttl_days=7)
    assert got is None


@pytest.mark.asyncio
async def test_upsert_then_hit(pool: asyncpg.Pool) -> None:
    p = UserProfile(
        username="testuser_hit",
        joined_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        followers=3,
        following=2,
        public_repos=5,
        recent_commits_60d=10,
        raw={"note": "test"},
    )
    await upsert_profile(pool, p)
    got = await get_cached(pool, "testuser_hit", ttl_days=7)
    assert got is not None and got.username == "testuser_hit" and got.followers == 3


@pytest.mark.asyncio
async def test_stale_cache_returns_none(pool: asyncpg.Pool) -> None:
    p = UserProfile(
        username="testuser_stale",
        joined_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
    )
    await upsert_profile(pool, p)
    async with pool.acquire() as c:
        await c.execute(
            "update stargazer_profile set cached_at=$1 where username='testuser_stale'",
            datetime.now(timezone.utc) - timedelta(days=8),
        )
    got = await get_cached(pool, "testuser_stale", ttl_days=7)
    assert got is None
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/worker && .venv/bin/pytest tests/test_profile_cache.py -v
```

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/profile_cache.py`**

```python
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import asyncpg

from .models import UserProfile


async def get_cached(pool: asyncpg.Pool, username: str, ttl_days: int) -> UserProfile | None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=ttl_days)
    async with pool.acquire() as c:
        row = await c.fetchrow(
            """
            select username, joined_at, followers, following, public_repos,
                   recent_commits_60d, raw, cached_at
            from stargazer_profile
            where username = $1 and cached_at >= $2
            """,
            username,
            cutoff,
        )
    if row is None:
        return None
    raw = row["raw"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    return UserProfile(
        username=row["username"],
        joined_at=row["joined_at"],
        followers=row["followers"],
        following=row["following"],
        public_repos=row["public_repos"],
        recent_commits_60d=row["recent_commits_60d"],
        bio=raw.get("bio"),
        avatar_is_default=raw.get("_avatar_default", False),
        raw=raw,
    )


async def upsert_profile(pool: asyncpg.Pool, p: UserProfile) -> None:
    raw = dict(p.raw)
    raw["_avatar_default"] = p.avatar_is_default
    raw.setdefault("bio", p.bio)
    async with pool.acquire() as c:
        await c.execute(
            """
            insert into stargazer_profile
              (username, joined_at, followers, following, public_repos,
               recent_commits_60d, raw, cached_at)
            values ($1,$2,$3,$4,$5,$6,$7::jsonb,now())
            on conflict (username) do update set
              joined_at          = excluded.joined_at,
              followers          = excluded.followers,
              following          = excluded.following,
              public_repos       = excluded.public_repos,
              recent_commits_60d = excluded.recent_commits_60d,
              raw                = excluded.raw,
              cached_at          = now()
            """,
            p.username,
            p.joined_at,
            p.followers,
            p.following,
            p.public_repos,
            p.recent_commits_60d,
            json.dumps(raw),
        )
```

- [ ] **Step 4: Run tests (requires local Supabase running)**

```bash
supabase start
.venv/bin/pytest tests/test_profile_cache.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/profile_cache.py apps/worker/tests/test_profile_cache.py
git commit -m "feat(worker): 7-day TTL profile cache backed by stargazer_profile"
```

---

## Task 5: Feature-classifier base + registry

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/__init__.py`
- Create: `apps/worker/src/tcabr_worker/features/base.py`

- [ ] **Step 1: Write `apps/worker/src/tcabr_worker/features/base.py`**

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Protocol

from ..models import StargazerEvent, UserProfile
from ..weights import WEIGHTS, FeatureId


@dataclass(frozen=True)
class FeatureContext:
    """Data visible to every feature classifier when scoring one stargazer."""

    profile: UserProfile
    event: StargazerEvent
    repo_burst_windows: list[tuple[datetime, datetime]]


class FeatureClassifier(Protocol):
    id: FeatureId

    def triggered(self, ctx: FeatureContext) -> bool: ...


_REGISTRY: dict[FeatureId, FeatureClassifier] = {}


def register(classifier: FeatureClassifier) -> FeatureClassifier:
    _REGISTRY[classifier.id] = classifier
    return classifier


def registry() -> dict[FeatureId, FeatureClassifier]:
    return dict(_REGISTRY)


def weight_for(fid: FeatureId) -> int:
    for f in WEIGHTS["features"]:
        if f["id"] == fid:
            return int(f["weight"])
    raise KeyError(fid)
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/features/__init__.py`**

```python
from . import (
    bot_username,
    new_account,
    no_recent_commits,
    sparse_profile,
    star_burst,
    star_farmer,
    zero_social,
)
from .base import FeatureContext, registry, weight_for

__all__ = [
    "FeatureContext",
    "registry",
    "weight_for",
    "bot_username",
    "new_account",
    "no_recent_commits",
    "sparse_profile",
    "star_burst",
    "star_farmer",
    "zero_social",
]
```

- [ ] **Step 3: Commit (temporary — registry has no members yet, but files compile once later steps land)**

```bash
git add apps/worker/src/tcabr_worker/features/base.py
git commit -m "feat(worker): feature-classifier base protocol + registry"
```

---

## Task 6: new_account feature

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/new_account.py`
- Test: `apps/worker/tests/test_features/test_new_account.py`
- Create: `apps/worker/tests/test_features/__init__.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_features/test_new_account.py
from datetime import datetime, timedelta, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.features.new_account import NewAccount
from tcabr_worker.models import StargazerEvent, UserProfile

ev = StargazerEvent(username="u", starred_at=datetime.now(timezone.utc))


def _ctx(joined: datetime) -> FeatureContext:
    return FeatureContext(
        profile=UserProfile(username="u", joined_at=joined),
        event=ev,
        repo_burst_windows=[],
    )


def test_triggered_when_under_180_days() -> None:
    joined = datetime.now(timezone.utc) - timedelta(days=30)
    assert NewAccount().triggered(_ctx(joined)) is True


def test_not_triggered_when_over_180_days() -> None:
    joined = datetime.now(timezone.utc) - timedelta(days=400)
    assert NewAccount().triggered(_ctx(joined)) is False
```

- [ ] **Step 2: Also write** `apps/worker/tests/test_features/__init__.py` **(empty file)**.

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/features/new_account.py`**

```python
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .base import FeatureContext, register


class NewAccount:
    id = "new_account"

    def triggered(self, ctx: FeatureContext) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(days=180)
        return ctx.profile.joined_at >= cutoff


register(NewAccount())
```

- [ ] **Step 4: Run test**

```bash
cd apps/worker && .venv/bin/pytest tests/test_features/test_new_account.py -v
```

Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/features/new_account.py apps/worker/tests/test_features/
git commit -m "feat(worker): new_account feature classifier"
```

---

## Task 7: no_recent_commits feature

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/no_recent_commits.py`
- Test: `apps/worker/tests/test_features/test_no_recent_commits.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_features/test_no_recent_commits.py
from datetime import datetime, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.features.no_recent_commits import NoRecentCommits
from tcabr_worker.models import StargazerEvent, UserProfile


def _ctx(recent: int) -> FeatureContext:
    return FeatureContext(
        profile=UserProfile(
            username="u",
            joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            recent_commits_60d=recent,
        ),
        event=StargazerEvent(username="u", starred_at=datetime.now(timezone.utc)),
        repo_burst_windows=[],
    )


def test_triggered_when_zero_commits() -> None:
    assert NoRecentCommits().triggered(_ctx(0)) is True


def test_not_triggered_when_commits_present() -> None:
    assert NoRecentCommits().triggered(_ctx(4)) is False
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/features/no_recent_commits.py`**

```python
from __future__ import annotations

from .base import FeatureContext, register


class NoRecentCommits:
    id = "no_recent_commits"

    def triggered(self, ctx: FeatureContext) -> bool:
        return ctx.profile.recent_commits_60d == 0


register(NoRecentCommits())
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/worker && .venv/bin/pytest tests/test_features/test_no_recent_commits.py -v && cd ../..
git add apps/worker/src/tcabr_worker/features/no_recent_commits.py apps/worker/tests/test_features/test_no_recent_commits.py
git commit -m "feat(worker): no_recent_commits feature classifier"
```

---

## Task 8: zero_social feature

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/zero_social.py`
- Test: `apps/worker/tests/test_features/test_zero_social.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_features/test_zero_social.py
from datetime import datetime, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.features.zero_social import ZeroSocial
from tcabr_worker.models import StargazerEvent, UserProfile


def _ctx(followers: int, following: int) -> FeatureContext:
    return FeatureContext(
        profile=UserProfile(
            username="u",
            joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            followers=followers,
            following=following,
        ),
        event=StargazerEvent(username="u", starred_at=datetime.now(timezone.utc)),
        repo_burst_windows=[],
    )


def test_triggered_when_both_zero() -> None:
    assert ZeroSocial().triggered(_ctx(0, 0)) is True


def test_not_triggered_when_either_nonzero() -> None:
    assert ZeroSocial().triggered(_ctx(0, 3)) is False
    assert ZeroSocial().triggered(_ctx(1, 0)) is False
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/features/zero_social.py`**

```python
from __future__ import annotations

from .base import FeatureContext, register


class ZeroSocial:
    id = "zero_social"

    def triggered(self, ctx: FeatureContext) -> bool:
        return ctx.profile.followers == 0 and ctx.profile.following == 0


register(ZeroSocial())
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/worker && .venv/bin/pytest tests/test_features/test_zero_social.py -v && cd ../..
git add apps/worker/src/tcabr_worker/features/zero_social.py apps/worker/tests/test_features/test_zero_social.py
git commit -m "feat(worker): zero_social feature classifier"
```

---

## Task 9: sparse_profile feature

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/sparse_profile.py`
- Test: `apps/worker/tests/test_features/test_sparse_profile.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_features/test_sparse_profile.py
from datetime import datetime, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.features.sparse_profile import SparseProfile
from tcabr_worker.models import StargazerEvent, UserProfile


def _ctx(bio: str | None, default_avatar: bool) -> FeatureContext:
    return FeatureContext(
        profile=UserProfile(
            username="u",
            joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            bio=bio,
            avatar_is_default=default_avatar,
        ),
        event=StargazerEvent(username="u", starred_at=datetime.now(timezone.utc)),
        repo_burst_windows=[],
    )


def test_triggered_when_empty_bio_and_default_avatar() -> None:
    assert SparseProfile().triggered(_ctx(None, True)) is True
    assert SparseProfile().triggered(_ctx("", True)) is True


def test_not_triggered_when_bio_present() -> None:
    assert SparseProfile().triggered(_ctx("hi", True)) is False


def test_not_triggered_when_custom_avatar() -> None:
    assert SparseProfile().triggered(_ctx(None, False)) is False
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/features/sparse_profile.py`**

```python
from __future__ import annotations

from .base import FeatureContext, register


class SparseProfile:
    id = "sparse_profile"

    def triggered(self, ctx: FeatureContext) -> bool:
        empty_bio = not (ctx.profile.bio and ctx.profile.bio.strip())
        return empty_bio and ctx.profile.avatar_is_default


register(SparseProfile())
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/worker && .venv/bin/pytest tests/test_features/test_sparse_profile.py -v && cd ../..
git add apps/worker/src/tcabr_worker/features/sparse_profile.py apps/worker/tests/test_features/test_sparse_profile.py
git commit -m "feat(worker): sparse_profile feature classifier"
```

---

## Task 10: star_farmer feature

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/star_farmer.py`
- Test: `apps/worker/tests/test_features/test_star_farmer.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_features/test_star_farmer.py
from datetime import datetime, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.features.star_farmer import StarFarmer
from tcabr_worker.models import StargazerEvent, UserProfile


def _ctx(starred: int, repos: int) -> FeatureContext:
    return FeatureContext(
        profile=UserProfile(
            username="u",
            joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            public_repos=repos,
            starred_repos_count=starred,
        ),
        event=StargazerEvent(username="u", starred_at=datetime.now(timezone.utc)),
        repo_burst_windows=[],
    )


def test_triggered_when_star_to_repo_ratio_extreme_and_over_50() -> None:
    assert StarFarmer().triggered(_ctx(500, 2)) is True


def test_not_triggered_when_under_50_stars() -> None:
    assert StarFarmer().triggered(_ctx(40, 0)) is False


def test_not_triggered_when_ratio_modest() -> None:
    assert StarFarmer().triggered(_ctx(100, 20)) is False
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/features/star_farmer.py`**

```python
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
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/worker && .venv/bin/pytest tests/test_features/test_star_farmer.py -v && cd ../..
git add apps/worker/src/tcabr_worker/features/star_farmer.py apps/worker/tests/test_features/test_star_farmer.py
git commit -m "feat(worker): star_farmer feature classifier"
```

---

## Task 11: bot_username feature

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/bot_username.py`
- Test: `apps/worker/tests/test_features/test_bot_username.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_features/test_bot_username.py
from datetime import datetime, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.features.bot_username import BotUsername
from tcabr_worker.models import StargazerEvent, UserProfile


def _ctx(u: str) -> FeatureContext:
    return FeatureContext(
        profile=UserProfile(
            username=u,
            joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        ),
        event=StargazerEvent(username=u, starred_at=datetime.now(timezone.utc)),
        repo_burst_windows=[],
    )


def test_triggered_on_hyphen_number_pattern() -> None:
    assert BotUsername().triggered(_ctx("john-smith-9381")) is True


def test_triggered_on_trailing_long_digits() -> None:
    assert BotUsername().triggered(_ctx("user728193")) is True


def test_not_triggered_on_normal_handles() -> None:
    assert BotUsername().triggered(_ctx("octocat")) is False
    assert BotUsername().triggered(_ctx("keeeeeeeks")) is False
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/features/bot_username.py`**

```python
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
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/worker && .venv/bin/pytest tests/test_features/test_bot_username.py -v && cd ../..
git add apps/worker/src/tcabr_worker/features/bot_username.py apps/worker/tests/test_features/test_bot_username.py
git commit -m "feat(worker): bot_username regex classifier"
```

---

## Task 12: Repo-level burst detection (PRE-PASS — spec advisory #2)

**Files:**
- Create: `apps/worker/src/tcabr_worker/burst.py`
- Test: `apps/worker/tests/test_burst.py`

This implements spec review advisory note #2: `star_burst` requires a repo-level analysis of the star time-series BEFORE per-user feature evaluation.

- [ ] **Step 1: Write failing test `apps/worker/tests/test_burst.py`**

```python
from datetime import datetime, timedelta, timezone

from tcabr_worker.burst import detect_burst_windows
from tcabr_worker.models import StargazerEvent


def _mk(n: int, start: datetime, step: timedelta) -> list[StargazerEvent]:
    return [
        StargazerEvent(username=f"u{i}", starred_at=start + step * i)
        for i in range(n)
    ]


def test_no_bursts_on_flat_distribution() -> None:
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    events = _mk(24 * 30, base, timedelta(hours=1))  # 1/hr for 30 days
    assert detect_burst_windows(events, bucket_hours=24, z_threshold=3.0) == []


def test_detects_spike() -> None:
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    events = _mk(30, base, timedelta(hours=24))  # 1/day
    spike_day = base + timedelta(days=10)
    events.extend(_mk(500, spike_day, timedelta(seconds=5)))  # 500 in 40min
    windows = detect_burst_windows(events, bucket_hours=24, z_threshold=3.0)
    assert len(windows) >= 1
    w = windows[0]
    assert w.start <= spike_day <= w.end
    assert w.z_score > 3.0


def test_empty_input_returns_empty() -> None:
    assert detect_burst_windows([], bucket_hours=24, z_threshold=3.0) == []
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/worker && .venv/bin/pytest tests/test_burst.py -v
```

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/burst.py`**

```python
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean, pstdev
from typing import Sequence

from .models import BurstWindow, StargazerEvent


def detect_burst_windows(
    events: Sequence[StargazerEvent],
    bucket_hours: int = 24,
    z_threshold: float = 3.0,
) -> list[BurstWindow]:
    """Bucket star events into fixed-width time windows and flag outlier buckets.

    Returns a list of BurstWindow spans whose star count z-score exceeds
    `z_threshold` relative to the overall distribution.
    """
    if not events:
        return []
    delta = timedelta(hours=bucket_hours)
    buckets: dict[datetime, int] = defaultdict(int)

    first = min(e.starred_at for e in events)
    epoch = first.replace(minute=0, second=0, microsecond=0)

    for e in events:
        idx = int((e.starred_at - epoch) / delta)
        start = epoch + delta * idx
        buckets[start] += 1

    # Ensure dense coverage (zero buckets count too, for accurate stats).
    last = max(buckets)
    cur = epoch
    while cur <= last:
        buckets.setdefault(cur, 0)
        cur += delta

    counts = list(buckets.values())
    if len(counts) < 3:
        return []
    mu = mean(counts)
    sigma = pstdev(counts) or 1.0

    windows: list[BurstWindow] = []
    for start, n in sorted(buckets.items()):
        z = (n - mu) / sigma
        if z >= z_threshold:
            windows.append(BurstWindow(start=start, end=start + delta, z_score=z))
    return windows
```

- [ ] **Step 4: Run test**

```bash
.venv/bin/pytest tests/test_burst.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/burst.py apps/worker/tests/test_burst.py
git commit -m "feat(worker): repo-level star-burst detection (pre-pass for per-user star_burst feature)"
```

---

## Task 13: star_burst per-user feature (wraps repo-level windows)

**Files:**
- Create: `apps/worker/src/tcabr_worker/features/star_burst.py`
- Test: `apps/worker/tests/test_features/test_star_burst.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_features/test_star_burst.py
from datetime import datetime, timedelta, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.features.star_burst import StarBurst
from tcabr_worker.models import StargazerEvent, UserProfile

BURST = (
    datetime(2025, 6, 1, tzinfo=timezone.utc),
    datetime(2025, 6, 2, tzinfo=timezone.utc),
)


def _ctx(when: datetime) -> FeatureContext:
    return FeatureContext(
        profile=UserProfile(username="u", joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc)),
        event=StargazerEvent(username="u", starred_at=when),
        repo_burst_windows=[BURST],
    )


def test_triggered_when_star_falls_inside_burst() -> None:
    assert StarBurst().triggered(_ctx(datetime(2025, 6, 1, 12, tzinfo=timezone.utc))) is True


def test_not_triggered_outside_burst() -> None:
    assert StarBurst().triggered(_ctx(datetime(2025, 5, 30, tzinfo=timezone.utc))) is False


def test_not_triggered_when_no_windows() -> None:
    ctx = FeatureContext(
        profile=UserProfile(username="u", joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc)),
        event=StargazerEvent(username="u", starred_at=datetime(2025, 6, 1, 12, tzinfo=timezone.utc)),
        repo_burst_windows=[],
    )
    assert StarBurst().triggered(ctx) is False
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/features/star_burst.py`**

```python
from __future__ import annotations

from .base import FeatureContext, register


class StarBurst:
    id = "star_burst"

    def triggered(self, ctx: FeatureContext) -> bool:
        t = ctx.event.starred_at
        return any(start <= t <= end for start, end in ctx.repo_burst_windows)


register(StarBurst())
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/worker && .venv/bin/pytest tests/test_features/test_star_burst.py -v && cd ../..
git add apps/worker/src/tcabr_worker/features/star_burst.py apps/worker/tests/test_features/test_star_burst.py
git commit -m "feat(worker): star_burst per-user feature wraps repo-level burst windows"
```

---

## Task 14: Scoring aggregator (per-user + repo-level bootstrap CI)

**Files:**
- Create: `apps/worker/src/tcabr_worker/scoring.py`
- Test: `apps/worker/tests/test_scoring.py`
- Modify: `apps/worker/pyproject.toml` (add `numpy`)

- [ ] **Step 1: Add `numpy`**

```bash
cd apps/worker
uv pip install 'numpy>=1.26' && \
  python -c "import tomllib, json; print('add numpy to pyproject manually')" >/dev/null
```

Then edit `apps/worker/pyproject.toml`, add `"numpy>=1.26"` to `dependencies`.

- [ ] **Step 2: Write failing test `apps/worker/tests/test_scoring.py`**

```python
from datetime import datetime, timezone

from tcabr_worker.features.base import FeatureContext
from tcabr_worker.models import StargazerEvent, UserProfile
from tcabr_worker.scoring import repo_aggregate, score_user


def _profile(**kw) -> UserProfile:
    base = dict(username="u", joined_at=datetime(2020, 1, 1, tzinfo=timezone.utc))
    base.update(kw)
    return UserProfile(**base)


def _ctx(profile: UserProfile, when: datetime | None = None) -> FeatureContext:
    return FeatureContext(
        profile=profile,
        event=StargazerEvent(username=profile.username, starred_at=when or datetime(2025, 1, 1, tzinfo=timezone.utc)),
        repo_burst_windows=[],
    )


def test_clean_profile_scores_zero() -> None:
    p = _profile(username="clean", followers=50, following=30, public_repos=10, recent_commits_60d=5, bio="hi")
    s = score_user(_ctx(p))
    assert s.score == 0
    assert all(not h.triggered for h in s.feature_hits)


def test_suspicious_profile_scores_high() -> None:
    p = _profile(
        username="user123456",
        joined_at=datetime.now(timezone.utc).replace(year=datetime.now(timezone.utc).year),
        followers=0, following=0, public_repos=0,
        recent_commits_60d=0, bio=None, avatar_is_default=True,
        starred_repos_count=500,
    )
    s = score_user(_ctx(p))
    assert s.score >= 80


def test_repo_aggregate_has_ci() -> None:
    scores = [0] * 50 + [80] * 50
    agg = repo_aggregate(scores, bootstrap=200, seed=1)
    assert 30 <= agg.mean <= 50
    assert agg.ci_low < agg.mean < agg.ci_high
```

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/scoring.py`**

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

from .features import registry, weight_for
from .features.base import FeatureContext
from .weights import WEIGHTS


@dataclass(frozen=True)
class FeatureHitResult:
    id: str
    triggered: bool
    weight: int


@dataclass(frozen=True)
class UserScore:
    username: str
    score: int
    feature_hits: list[FeatureHitResult]


@dataclass(frozen=True)
class RepoAggregate:
    mean: int
    ci_low: int
    ci_high: int


def score_user(ctx: FeatureContext) -> UserScore:
    raw = 0
    hits: list[FeatureHitResult] = []
    for fid, cls in registry().items():
        triggered = cls.triggered(ctx)
        w = weight_for(fid)
        if triggered:
            raw += w
        hits.append(FeatureHitResult(id=fid, triggered=triggered, weight=w))
    max_raw = WEIGHTS["normalization"]["max_raw"]
    scale = WEIGHTS["normalization"]["scale"]
    normalized = round(scale * raw / max_raw) if max_raw else 0
    return UserScore(username=ctx.profile.username, score=normalized, feature_hits=hits)


def repo_aggregate(scores: Sequence[int], bootstrap: int = 2000, seed: int = 1) -> RepoAggregate:
    """Mean anomaly score with a 95% bootstrap CI.

    `scores` is the list of per-user normalized (0-100) scores for the scanned sample.
    """
    if not scores:
        return RepoAggregate(mean=0, ci_low=0, ci_high=0)
    arr = np.asarray(scores, dtype=float)
    rng = np.random.default_rng(seed)
    n = len(arr)
    means = np.empty(bootstrap)
    for i in range(bootstrap):
        idx = rng.integers(0, n, size=n)
        means[i] = arr[idx].mean()
    lo, hi = np.percentile(means, [2.5, 97.5])
    return RepoAggregate(mean=round(float(arr.mean())), ci_low=round(float(lo)), ci_high=round(float(hi)))
```

- [ ] **Step 4: Run test**

```bash
.venv/bin/pytest tests/test_scoring.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/scoring.py apps/worker/tests/test_scoring.py apps/worker/pyproject.toml
git commit -m "feat(worker): per-user scoring + repo bootstrap 95% CI"
```

---

## Task 15: Pipeline orchestrator

**Files:**
- Create: `apps/worker/src/tcabr_worker/pipeline.py`
- Test: `apps/worker/tests/test_pipeline.py`

- [ ] **Step 1: Write failing test `apps/worker/tests/test_pipeline.py`**

```python
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from tcabr_worker.models import RepoMeta, ScanRequest, StargazerEvent, UserProfile
from tcabr_worker.pipeline import run_scan


def _stargazer(i: int) -> StargazerEvent:
    return StargazerEvent(
        username=f"u{i}",
        starred_at=datetime(2025, 6, 1, tzinfo=timezone.utc) + timedelta(minutes=i),
    )


def _profile(i: int) -> UserProfile:
    return UserProfile(
        username=f"u{i}",
        joined_at=datetime(2025, 5, 1, tzinfo=timezone.utc),  # all "new accounts"
        followers=0, following=0, public_repos=0, recent_commits_60d=0,
        bio=None, avatar_is_default=True, starred_repos_count=0,
    )


@pytest.mark.asyncio
async def test_run_scan_produces_snapshot_dict() -> None:
    gh = MagicMock()
    gh.fetch_repo_meta = AsyncMock(return_value=RepoMeta(owner="x", name="y", star_count=3, default_branch="main"))

    async def gen():
        for i in range(3):
            yield _stargazer(i)
    gh.iter_stargazers = lambda *a, **kw: gen()
    gh.fetch_user_profile = AsyncMock(side_effect=lambda u: _profile(int(u[1:])))
    gh.count_recent_public_commits = AsyncMock(return_value=0)
    gh.count_starred_repos = AsyncMock(return_value=0)

    snap = await run_scan(
        ScanRequest(owner="x", name="y"),
        gh=gh,
        get_cached=AsyncMock(return_value=None),
        upsert_profile=AsyncMock(),
        sample_threshold=5000,
        sample_size=2000,
    )

    assert snap["repo"] == {"owner": "x", "name": "y", "star_count": 3}
    assert snap["sample_size"] == 3
    assert snap["stargazer_total"] == 3
    assert snap["anomaly_score"] > 0  # all "new, empty" profiles trigger features
    assert len(snap["classifications"]) == 3
    assert snap["feature_breakdown"]["new_account"] == 3
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/pipeline.py`**

```python
from __future__ import annotations

from collections import Counter
from typing import Any, Awaitable, Callable, Protocol

import structlog

from .burst import detect_burst_windows
from .config import settings
from .features import FeatureContext, registry
from .models import RepoMeta, ScanRequest, StargazerEvent, UserProfile
from .sampler import sample_stargazers
from .scoring import repo_aggregate, score_user

log = structlog.get_logger()


class _GH(Protocol):
    async def fetch_repo_meta(self, owner: str, name: str) -> RepoMeta: ...
    def iter_stargazers(self, owner: str, name: str): ...
    async def fetch_user_profile(self, username: str) -> UserProfile: ...
    async def count_recent_public_commits(self, username: str, days: int = 60) -> int: ...
    async def count_starred_repos(self, username: str) -> int: ...


GetCached = Callable[[str], Awaitable[UserProfile | None]]
UpsertProfile = Callable[[UserProfile], Awaitable[None]]


async def _resolve_profile(
    gh: _GH, username: str, get_cached: GetCached, upsert_profile: UpsertProfile
) -> UserProfile:
    cached = await get_cached(username)
    if cached is not None:
        return cached
    p = await gh.fetch_user_profile(username)
    p = p.model_copy(update={
        "recent_commits_60d": await gh.count_recent_public_commits(username, 60),
        "starred_repos_count": await gh.count_starred_repos(username),
    })
    await upsert_profile(p)
    return p


async def run_scan(
    req: ScanRequest,
    *,
    gh: _GH,
    get_cached: Callable[[str], Awaitable[UserProfile | None]],
    upsert_profile: Callable[[UserProfile], Awaitable[None]],
    sample_threshold: int | None = None,
    sample_size: int | None = None,
) -> dict[str, Any]:
    """Execute a full scan and return a snapshot dict ready for DB write."""
    threshold = sample_threshold or settings.sample_threshold
    size = sample_size or settings.sample_size_default

    meta = await gh.fetch_repo_meta(req.owner, req.name)
    log.info("scan.start", repo=req.repo_slug, star_count=meta.star_count)

    all_events: list[StargazerEvent] = [e async for e in gh.iter_stargazers(req.owner, req.name)]
    sample, is_full = sample_stargazers(all_events, threshold, size, seed=hash(req.repo_slug) % (2**32))

    # Repo-level pre-pass — burst windows computed on the FULL event set.
    burst_windows = detect_burst_windows(all_events, bucket_hours=24, z_threshold=3.0)
    burst_tuples = [(w.start, w.end) for w in burst_windows]

    # Resolve profiles (cache-first) and score each sampled stargazer.
    hits_count: Counter[str] = Counter()
    per_user_scores: list[int] = []
    classifications: list[dict[str, Any]] = []

    # Initialize breakdown keys from registry so every feature shows up even if 0.
    for fid in registry().keys():
        hits_count.setdefault(fid, 0)

    for ev in sample:
        profile = await _resolve_profile(gh, ev.username, get_cached, upsert_profile)
        ctx = FeatureContext(profile=profile, event=ev, repo_burst_windows=burst_tuples)
        us = score_user(ctx)
        per_user_scores.append(us.score)
        for h in us.feature_hits:
            if h.triggered:
                hits_count[h.id] += 1
        classifications.append({
            "username": profile.username,
            "anomaly_score": us.score,
            "feature_hits": [
                {"id": h.id, "triggered": h.triggered, "weight": h.weight}
                for h in us.feature_hits
            ],
            "starred_at": ev.starred_at.isoformat(),
        })

    agg = repo_aggregate(per_user_scores)

    timeseries: list[dict[str, Any]] = [
        {"date": ev.starred_at.date().isoformat(), "n": 1}
        for ev in all_events
    ]
    # Collapse by date
    collapsed: Counter[str] = Counter()
    for row in timeseries:
        collapsed[row["date"]] += 1
    timeseries = [{"date": d, "n": n} for d, n in sorted(collapsed.items())]

    return {
        "repo": {"owner": meta.owner, "name": meta.name, "star_count": meta.star_count},
        "anomaly_score": agg.mean,
        "score_ci_low": agg.ci_low,
        "score_ci_high": agg.ci_high,
        "sample_size": len(sample),
        "stargazer_total": len(all_events),
        "is_full_population": is_full,
        "feature_breakdown": dict(hits_count),
        "star_timeseries": timeseries,
        "burst_windows": [w.model_dump(mode="json") for w in burst_windows],
        "classifications": classifications,
    }
```

- [ ] **Step 3: Run test**

```bash
cd apps/worker && .venv/bin/pytest tests/test_pipeline.py -v
```

Expected: 1 pass.

- [ ] **Step 4: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/pipeline.py apps/worker/tests/test_pipeline.py
git commit -m "feat(worker): scan pipeline orchestrator with repo-level burst pre-pass"
```

---

## Task 16: DB writes for snapshot + classifications

**Files:**
- Create: `apps/worker/src/tcabr_worker/persist.py`
- Test: `apps/worker/tests/test_persist.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_persist.py
from datetime import datetime, timezone
from uuid import UUID

import asyncpg
import pytest

from tcabr_worker.config import settings
from tcabr_worker.persist import persist_snapshot


@pytest.fixture
async def pool() -> asyncpg.Pool:
    p = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    async with p.acquire() as c:
        await c.execute("delete from repo where owner='persisttest'")
        await c.execute("delete from stargazer_profile where username like 'persist_%'")
    yield p
    await p.close()


@pytest.mark.asyncio
async def test_persist_snapshot_writes_repo_and_snapshot(pool: asyncpg.Pool) -> None:
    # Seed one stargazer_profile so FK holds.
    async with pool.acquire() as c:
        await c.execute(
            "insert into stargazer_profile(username, joined_at) values('persist_u1', $1)",
            datetime(2025, 1, 1, tzinfo=timezone.utc),
        )
    snap = {
        "repo": {"owner": "persisttest", "name": "demo", "star_count": 1},
        "anomaly_score": 42, "score_ci_low": 30, "score_ci_high": 55,
        "sample_size": 1, "stargazer_total": 1, "is_full_population": True,
        "feature_breakdown": {"new_account": 1},
        "star_timeseries": [{"date": "2025-06-01", "n": 1}],
        "burst_windows": [],
        "classifications": [{
            "username": "persist_u1",
            "anomaly_score": 42,
            "feature_hits": [{"id": "new_account", "triggered": True, "weight": 3}],
            "starred_at": "2025-06-01T00:00:00+00:00",
        }],
    }
    snapshot_id = await persist_snapshot(pool, snap)
    assert UUID(str(snapshot_id))

    async with pool.acquire() as c:
        cls = await c.fetch(
            "select username, anomaly_score from stargazer_classification where snapshot_id=$1",
            snapshot_id,
        )
    assert len(cls) == 1 and cls[0]["username"] == "persist_u1"
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/persist.py`**

```python
from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg


async def persist_snapshot(pool: asyncpg.Pool, snap: dict[str, Any]) -> UUID:
    async with pool.acquire() as c, c.transaction():
        repo_id = await c.fetchval(
            """
            insert into repo (owner, name, star_count, last_scanned_at)
            values ($1, $2, $3, now())
            on conflict (owner, name) do update
              set star_count = excluded.star_count,
                  last_scanned_at = now()
            returning id
            """,
            snap["repo"]["owner"],
            snap["repo"]["name"],
            snap["repo"]["star_count"],
        )
        snapshot_id: UUID = await c.fetchval(
            """
            insert into repo_snapshot
              (repo_id, anomaly_score, score_ci_low, score_ci_high,
               sample_size, stargazer_total, feature_breakdown, star_timeseries, burst_windows)
            values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
            returning id
            """,
            repo_id,
            snap["anomaly_score"],
            snap["score_ci_low"],
            snap["score_ci_high"],
            snap["sample_size"],
            snap["stargazer_total"],
            json.dumps(snap["feature_breakdown"]),
            json.dumps(snap["star_timeseries"]),
            json.dumps(snap["burst_windows"]),
        )
        for cls in snap["classifications"]:
            await c.execute(
                """
                insert into stargazer_classification
                  (snapshot_id, username, anomaly_score, feature_hits, starred_at)
                values ($1,$2,$3,$4::jsonb,$5)
                on conflict (snapshot_id, username) do nothing
                """,
                snapshot_id,
                cls["username"],
                cls["anomaly_score"],
                json.dumps(cls["feature_hits"]),
                datetime.fromisoformat(cls["starred_at"]),
            )
        return snapshot_id
```

- [ ] **Step 3: Run test**

```bash
cd apps/worker && .venv/bin/pytest tests/test_persist.py -v
```

Expected: 1 pass.

- [ ] **Step 4: Commit**

```bash
cd ../.. && git add apps/worker/src/tcabr_worker/persist.py apps/worker/tests/test_persist.py
git commit -m "feat(worker): persist repo + snapshot + classifications atomically"
```

---

## Task 17: arq job registration

**Files:**
- Modify: `apps/worker/src/tcabr_worker/main.py`
- Create: `apps/worker/src/tcabr_worker/jobs.py`

- [ ] **Step 1: Write `apps/worker/src/tcabr_worker/jobs.py`**

```python
from __future__ import annotations

from functools import partial
from typing import Any

from .db import get_pool
from .github import GitHubClient
from .models import ScanRequest
from .persist import persist_snapshot
from .pipeline import run_scan
from .profile_cache import get_cached, upsert_profile


async def scan_repo(
    ctx: dict,
    owner: str,
    name: str,
    user_token: str | None = None,
) -> dict[str, Any]:
    pool = await get_pool()
    async with GitHubClient(token=user_token) as gh:
        snap = await run_scan(
            ScanRequest(owner=owner, name=name, user_token=user_token),
            gh=gh,
            get_cached=partial(_cached, pool),
            upsert_profile=partial(_upsert, pool),
        )
    snapshot_id = await persist_snapshot(pool, snap)
    return {"snapshot_id": str(snapshot_id), "anomaly_score": snap["anomaly_score"]}


async def _cached(pool, username):
    return await get_cached(pool, username, ttl_days=7)


async def _upsert(pool, profile):
    return await upsert_profile(pool, profile)
```

- [ ] **Step 2: Update `apps/worker/src/tcabr_worker/main.py`**

Replace the `WorkerSettings.functions` list to include `scan_repo`:

```python
from __future__ import annotations

from arq.connections import RedisSettings

from .config import settings
from .db import close_pool
from .jobs import scan_repo
from .sentry import init_sentry


async def startup(ctx: dict) -> None:
    init_sentry()
    ctx["started"] = True


async def shutdown(ctx: dict) -> None:
    await close_pool()


async def health(ctx: dict) -> dict[str, str]:
    return {"status": "ok"}


class WorkerSettings:
    functions = [health, scan_repo]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 4
    job_timeout = 60 * 30  # 30 min cap for large scans
```

- [ ] **Step 3: Smoke test worker locally**

```bash
cd apps/worker
.venv/bin/arq tcabr_worker.main.WorkerSettings &
WORKER_PID=$!
sleep 2
# Enqueue a real scan from a tiny repo and poll
.venv/bin/python - <<'PY'
import asyncio
from arq.connections import create_pool, RedisSettings
from tcabr_worker.config import settings

async def main():
    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    job = await pool.enqueue_job("scan_repo", "octocat", "hello-world")
    print("enqueued", job.job_id)
    result = await job.result(timeout=120)
    print("result", result)

asyncio.run(main())
PY
kill $WORKER_PID
cd ../..
```

Expected: prints an enqueue ID and a result dict with a UUID and anomaly_score.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/tcabr_worker/
git commit -m "feat(worker): register scan_repo arq job"
```

---

## Task 18: Full pytest sweep + ruff

**Files:** none new — verification only.

- [ ] **Step 1: Run full suite**

```bash
cd apps/worker
.venv/bin/ruff check src tests
.venv/bin/pytest -v
cd ../..
```

Expected: ruff clean, ~25 tests pass.

- [ ] **Step 2: Commit any final lint fixes if needed**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(worker): lint fixes"
```

---

## Self-Review Notes

- **Spec coverage:** Sections 5 (scan flow), 6 (all tables written), 7 (all 7 features), plus advisory #2 (star_burst is implemented as a repo-level pre-pass feeding per-user scoring) and advisory #3 (composite PK `(snapshot_id, username)` is enforced by the schema from Plan 1 and respected by `persist_snapshot`) are covered.
- **Deferred:** API-side triggering from the Next.js app (Plan 3 Task on `/api/scan`), tier-aware cache policy (Plan 3 Task "cache-policy lib"), removal-request filtering at query time (Plan 5).
- **Calibration reminder:** Pre-launch, scan 20 known repos and review the `feature_breakdown` distribution; adjust weights in `packages/shared/src/feature-weights.json` and re-run `pnpm seed:weights`. No code changes required.
