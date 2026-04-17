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
