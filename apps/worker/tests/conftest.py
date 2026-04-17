import pytest


@pytest.fixture
def dummy_ctx() -> dict:
    return {"started": True}
