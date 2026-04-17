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
    assert all(e.starred_at.utcoffset() is not None for e in events)


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
