from datetime import datetime, timezone

from tcabr_worker.models import StargazerEvent
from tcabr_worker.sampler import sample_stargazers


def _ev(n: int) -> StargazerEvent:
    return StargazerEvent(username=f"u{n}", starred_at=datetime(2025, 1, 1, tzinfo=timezone.utc))


def test_no_sample_when_below_threshold() -> None:
    events = [_ev(i) for i in range(100)]
    out, full = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    assert out == events and full is True


def test_sample_when_above_threshold() -> None:
    events = [_ev(i) for i in range(6000)]
    out, full = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    assert len(out) == 2000 and full is False
    usernames = {e.username for e in out}
    assert len(usernames) == 2000  # no duplicates


def test_sample_is_deterministic_with_seed() -> None:
    events = [_ev(i) for i in range(10000)]
    a, _ = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    b, _ = sample_stargazers(events, threshold=5000, size=2000, seed=42)
    assert [e.username for e in a] == [e.username for e in b]
