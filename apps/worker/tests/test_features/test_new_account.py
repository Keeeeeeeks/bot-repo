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
