# apps/worker/tests/test_features/test_star_burst.py
from datetime import datetime, timezone

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
