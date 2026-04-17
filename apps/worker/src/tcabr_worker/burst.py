from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from statistics import mean, pstdev
from typing import Sequence

from .models import BurstWindow, StargazerEvent


def detect_burst_windows(
    events: Sequence[StargazerEvent],
    bucket_hours: int = 24,
    z_threshold: float = 3.0,
) -> list[BurstWindow]:
    """Bucket star events into fixed-width time windows and flag outlier buckets.

    Returns a list of BurstWindow spans whose star count z-score exceeds
    `z_threshold` relative to the overall distribution.
    """
    if not events:
        return []
    delta = timedelta(hours=bucket_hours)
    buckets: dict[datetime, int] = defaultdict(int)

    first = min(e.starred_at for e in events)
    epoch = first.replace(minute=0, second=0, microsecond=0)

    for e in events:
        idx = int((e.starred_at - epoch) / delta)
        start = epoch + delta * idx
        buckets[start] += 1

    # Ensure dense coverage (zero buckets count too, for accurate stats).
    last = max(buckets)
    cur = epoch
    while cur <= last:
        buckets.setdefault(cur, 0)
        cur += delta

    counts = list(buckets.values())
    if len(counts) < 3:
        return []
    mu = mean(counts)
    sigma = pstdev(counts) or 1.0

    windows: list[BurstWindow] = []
    for start, n in sorted(buckets.items()):
        z = (n - mu) / sigma
        if z >= z_threshold:
            windows.append(BurstWindow(start=start, end=start + delta, z_score=z))
    return windows
