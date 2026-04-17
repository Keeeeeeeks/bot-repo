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
    from datetime import timedelta

    ev = StargazerEvent(username="octocat", starred_at="2025-12-01T10:00:00Z")
    assert ev.starred_at.utcoffset() == timedelta(0)


def test_user_profile_defaults() -> None:
    p = UserProfile(username="ghost", joined_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert p.followers == 0 and p.following == 0


def test_burst_window_roundtrip() -> None:
    w = BurstWindow(start="2025-12-01T00:00:00Z", end="2025-12-01T06:00:00Z", z_score=4.1)
    assert w.end > w.start


def test_repo_meta_counts() -> None:
    r = RepoMeta(owner="x", name="y", star_count=123, default_branch="main")
    assert r.star_count == 123
