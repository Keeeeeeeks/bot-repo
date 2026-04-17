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
