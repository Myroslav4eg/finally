"""Background portfolio snapshot task."""

import asyncio

import pytest

from app.db.repositories import snapshots as snapshots_repo
from app.services.snapshots import SNAPSHOT_INTERVAL, run_snapshot_loop

pytestmark = pytest.mark.usefixtures("temp_db")


def test_default_interval_is_thirty_seconds():
    assert SNAPSHOT_INTERVAL == 30.0


async def test_loop_records_snapshots_until_cancelled(market):
    task = asyncio.create_task(run_snapshot_loop(market, interval=0.01))
    await asyncio.sleep(0.06)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    recorded = snapshots_repo.list_snapshots()
    assert len(recorded) >= 2
    assert all(snapshot.total_value == 10000.0 for snapshot in recorded)
