import json
from datetime import datetime, timezone

import pytest

from validate_published_freshness import validate


def test_accepts_recent_snapshot_and_rejects_stale_snapshot(tmp_path):
    path = tmp_path / "snapshot.json"
    path.write_text(json.dumps({"generatedAt": "2026-08-17T00:00:00Z"}), encoding="utf-8")
    now = datetime(2026, 8, 17, 2, tzinfo=timezone.utc)
    validate(path, "generatedAt", 3, now)
    with pytest.raises(ValueError, match="stale"):
        validate(path, "generatedAt", 1, now)


def test_rejects_snapshot_below_publication_minimums(tmp_path):
    path = tmp_path / "snapshot.json"
    path.write_text(json.dumps({
        "generatedAt": "2026-08-17T00:00:00Z",
        "signals": [],
        "catalysts": [],
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="only 0 signals; minimum is 15"):
        validate(
            path,
            "generatedAt",
            3,
            datetime(2026, 8, 17, 1, tzinfo=timezone.utc),
            minimum_items={"signals": 15, "catalysts": 5},
        )
