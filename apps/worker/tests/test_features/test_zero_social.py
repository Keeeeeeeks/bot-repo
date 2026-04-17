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
