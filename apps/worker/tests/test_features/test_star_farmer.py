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
