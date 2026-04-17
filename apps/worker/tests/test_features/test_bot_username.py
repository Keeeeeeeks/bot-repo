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
