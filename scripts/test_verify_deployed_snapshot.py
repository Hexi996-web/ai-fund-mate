from datetime import datetime, timezone

from scripts import verify_deployed_snapshot as verifier
from scripts.verify_deployed_snapshot import _attention_is_fresh, _date, _timestamp


def test_attention_freshness_crosses_the_calendar_day_boundary() -> None:
    now = datetime(2026, 8, 31, 0, 30, tzinfo=timezone.utc)
    assert _attention_is_fresh("2026-08-30T22:30:00Z", 4, now)
    assert not _attention_is_fresh("2026-08-30T19:00:00Z", 4, now)


def test_attention_freshness_understands_china_timezone() -> None:
    now = datetime(2026, 8, 31, 0, 30, tzinfo=timezone.utc)
    assert _attention_is_fresh("2026-08-31T07:30:00+08:00", 4, now)


def test_invalid_timestamps_fail_closed() -> None:
    assert _timestamp("not-a-date") is None
    assert not _attention_is_fresh(None, 4)
    assert _date("2026-08-31 08:00:00") == "2026-08-31"


def test_daily_snapshot_accepts_independently_fresh_attention(monkeypatch) -> None:
    generated_at = datetime.now(timezone.utc).isoformat()

    def fake_json(url: str) -> dict:
        if "fund_products" in url:
            return {"updateTime": "2026-08-31 08:00:00"}
        if "issuance_insights" in url:
            return {"dataDate": "2026-08-31"}
        if "attention_pool" in url:
            return {"generatedAt": generated_at, "verifiedCount": 36, "recommendedIds": list(range(10))}
        return {"snapshotDate": "2026-08-31"}

    monkeypatch.setattr(verifier, "_json", fake_json)
    verifier.wait_for_deployment("https://example.test", "2026-08-31", 1, 4)
