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
