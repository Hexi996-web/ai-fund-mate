from datetime import datetime, timezone

import pytest

from data_pipeline.raw_store import RawSnapshotStore


def test_identical_content_is_content_addressed(tmp_path):
    store = RawSnapshotStore(tmp_path)
    now = datetime(2026, 8, 12, tzinfo=timezone.utc)
    first = store.save("pbc", now, b"payload", "application/json")
    second = store.save("pbc", now, b"payload", "application/json")
    assert first.sha256 == second.sha256
    assert first.path == second.path
    assert first.path.read_bytes() == b"payload"


def test_source_id_cannot_escape_root(tmp_path):
    with pytest.raises(ValueError):
        RawSnapshotStore(tmp_path).save("../escape", datetime.now(timezone.utc), b"x", "text/plain")
