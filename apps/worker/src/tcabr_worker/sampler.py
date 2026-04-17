from __future__ import annotations

import random
from typing import Sequence

from .models import StargazerEvent


def sample_stargazers(
    events: Sequence[StargazerEvent],
    threshold: int,
    size: int,
    seed: int,
) -> tuple[list[StargazerEvent], bool]:
    """Returns (sample, is_full_population).

    If len(events) <= threshold, returns all events and full=True.
    Otherwise returns a random sample of `size` events, seeded deterministically.
    """
    if len(events) <= threshold:
        return list(events), True
    rng = random.Random(seed)
    return rng.sample(list(events), size), False
