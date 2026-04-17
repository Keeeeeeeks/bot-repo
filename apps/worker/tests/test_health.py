import pytest

from tcabr_worker.main import health


@pytest.mark.asyncio
async def test_health_returns_ok(dummy_ctx: dict) -> None:
    assert await health(dummy_ctx) == {"status": "ok"}
