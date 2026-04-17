from datetime import datetime, timedelta, timezone

from tcabr_worker.burst import detect_burst_windows
from tcabr_worker.models import StargazerEvent


def _mk(n: int, start: datetime, step: timedelta) -> list[StargazerEvent]:
    return [
        StargazerEvent(username=f"u{i}", starred_at=start + step * i)
        for i in range(n)
    ]


def test_no_bursts_on_flat_distribution() -> None:
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    events = _mk(24 * 30, base, timedelta(hours=1))  # 1/hr for 30 days
    assert detect_burst_windows(events, bucket_hours=24, z_threshold=3.0) == []


def test_detects_spike() -> None:
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    events = _mk(30, base, timedelta(hours=24))  # 1/day
    spike_day = base + timedelta(days=10)
    events.extend(_mk(500, spike_day, timedelta(seconds=5)))  # 500 in 40min
    windows = detect_burst_windows(events, bucket_hours=24, z_threshold=3.0)
    assert len(windows) >= 1
    w = windows[0]
    assert w.start <= spike_day <= w.end
    assert w.z_score > 3.0


def test_empty_input_returns_empty() -> None:
    assert detect_burst_windows([], bucket_hours=24, z_threshold=3.0) == []
