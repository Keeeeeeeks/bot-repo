from tcabr_worker.weights import WEIGHTS


def test_weights_load() -> None:
    assert WEIGHTS["version"] >= 1
    ids = [f["id"] for f in WEIGHTS["features"]]
    assert len(set(ids)) == len(ids)


def test_weights_sum_matches_max_raw() -> None:
    total = sum(f["weight"] for f in WEIGHTS["features"])
    assert total == WEIGHTS["normalization"]["max_raw"]
