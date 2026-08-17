import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from data_pipeline.daily_brief import build_daily_brief
from data_pipeline.signal_domain import (
    CatalystRecord,
    DailyBrief,
    EventCluster,
    PipelineRun,
    RawItem,
    SignalEvidence,
    SignalRecord,
    SourceRecord,
    SourceTier,
    ValidationStatus,
)
import data_pipeline.signal_publish as signal_publish
from data_pipeline.signal_publish import build_snapshot, publish_snapshot
from data_pipeline.signal_storage import SignalRepository


NOW = datetime(2026, 8, 14, 0, 0, tzinfo=timezone.utc)


def repo_with_signal(tmp_path):
    repo = SignalRepository(tmp_path / "signals.db")
    repo.initialize()
    repo.upsert_source(SourceRecord(
        id="pbc", name="People's Bank of China", url="https://www.pbc.gov.cn",
        source_tier=SourceTier.OFFICIAL,
    ))
    raw_item = repo.save_raw_item(RawItem(
        source_id="pbc", url="https://www.pbc.gov.cn/policy/1", title="Policy update",
        body="Official policy evidence", content_hash="publish-raw-1",
        collected_at=NOW, published_at=NOW,
    ))
    repo.upsert_cluster(EventCluster(
        id="cluster-1", title="Policy update", category="policy",
        created_at=NOW, updated_at=NOW,
    ))
    repo.upsert_signal(SignalRecord(
        id="signal-1", cluster_id="cluster-1", category="policy",
        title="Policy update", summary="Official policy evidence", priority=88,
        source_confidence=.95, customer_demand_score=.5,
        validation_status=ValidationStatus.CONFIRMED,
        published_at=NOW, created_at=NOW, updated_at=NOW,
    ))
    repo.replace_signal_evidence([SignalEvidence(
        signal_id="signal-1", raw_item_id=raw_item.id, evidence_type="policy",
        excerpt="Official policy evidence", source_confidence=.95,
    )])
    repo.upsert_catalyst(CatalystRecord(
        id="catalyst-1", signal_id="signal-1", title="Policy briefing",
        scheduled_at=NOW + timedelta(days=1), priority=4,
        validation_status=ValidationStatus.CONFIRMED,
    ))
    repo.save_brief(DailyBrief(
        id="daily-brief-2026-08-14", window_start=NOW - timedelta(days=1),
        window_end=NOW, generated_at=NOW, body="Daily decision brief",
        signal_ids=["signal-1"], top_call="Watch policy implementation",
    ))
    return repo


def test_publish_replaces_snapshot_atomically(tmp_path):
    target = tmp_path / "nested" / "signal-radar.json"

    publish_snapshot(repo_with_signal(tmp_path), target, generated_at=NOW)

    payload = json.loads(target.read_text(encoding="utf-8"))
    assert payload["schemaVersion"] == 1
    assert not list(target.parent.glob("*.tmp"))


def test_snapshot_has_complete_contract_and_source_traceability(tmp_path):
    payload = build_snapshot(repo_with_signal(tmp_path), generated_at=NOW)

    assert set(payload) == {
        "schemaVersion", "generatedAt", "health", "regime", "signals",
        "themes", "catalysts", "dailyBrief",
    }
    assert payload["signals"][0]["sources"] == [{
        "url": "https://www.pbc.gov.cn/policy/1",
        "excerpt": "Official policy evidence",
        "confidence": .95,
    }]
    assert payload["dailyBrief"]["signalIds"] == ["signal-1"]
    assert payload["catalysts"][0]["validationStatus"] == "confirmed"


def test_publish_keeps_existing_snapshot_if_replace_fails(tmp_path, monkeypatch):
    target = tmp_path / "signal-radar.json"
    target.write_text('{"old": true}', encoding="utf-8")

    def fail_replace(_source, _target):
        raise OSError("replace interrupted")

    monkeypatch.setattr("data_pipeline.signal_publish.os.replace", fail_replace)

    try:
        publish_snapshot(repo_with_signal(tmp_path), target, generated_at=NOW)
    except OSError as error:
        assert str(error) == "replace interrupted"
    else:
        raise AssertionError("publish_snapshot must surface an atomic replace failure")

    assert json.loads(target.read_text(encoding="utf-8")) == {"old": True}
    assert not list(tmp_path.glob("*.tmp"))

def test_snapshot_omits_signal_that_has_not_been_published(tmp_path):
    repo = repo_with_signal(tmp_path)
    repo.upsert_signal(SignalRecord(
        id="draft", cluster_id="cluster-1", category="policy", title="Draft",
        summary="Not approved for publication", priority=99, source_confidence=.9,
        customer_demand_score=.5, validation_status=ValidationStatus.CONFIRMED,
        published_at=None, created_at=NOW, updated_at=NOW,
    ))

    payload = build_snapshot(repo, generated_at=NOW)

    assert [signal["id"] for signal in payload["signals"]] == ["signal-1"]


def test_health_uses_pipeline_runs_instead_of_query_time(tmp_path):
    repo = SignalRepository(tmp_path / "health.db")
    repo.initialize()
    assert build_snapshot(repo, generated_at=NOW)["health"] == {
        "status": "degraded",
        "backend": "sqlite",
        "lastSuccessfulUpdate": None,
        "fresh": False,
        "signalCount": 0,
        "catalystCount": 0,
        "rawItemCount": 0,
    }
    repo.record_run(PipelineRun(
        id="success", command="collect", started_at=NOW, finished_at=NOW,
        status="success", summary="ok",
    ))
    repo.record_run(PipelineRun(
        id="failure", command="collect", started_at=NOW + timedelta(hours=1),
        finished_at=NOW + timedelta(hours=1), status="failed", summary="failed",
    ))

    health = build_snapshot(repo, generated_at=NOW + timedelta(hours=2))["health"]

    assert health["status"] == "degraded"
    assert health["lastSuccessfulUpdate"] == NOW.isoformat()

def test_publishable_brief_excludes_draft_signal_from_ids_and_body(tmp_path):
    repo = repo_with_signal(tmp_path)
    draft_time = NOW - timedelta(hours=1)
    repo.upsert_signal(SignalRecord(
        id="draft", cluster_id="cluster-1", category="policy", title="Secret draft title",
        summary="Secret draft summary", priority=99, source_confidence=.9,
        customer_demand_score=.5, validation_status=ValidationStatus.CONFIRMED,
        published_at=None, created_at=draft_time, updated_at=draft_time,
    ))
    run_at = datetime(2026, 8, 14, 8, tzinfo=ZoneInfo("Asia/Shanghai"))
    repo.save_brief(build_daily_brief(repo, run_at))

    payload = build_snapshot(repo, generated_at=NOW)

    assert "draft" not in payload["dailyBrief"]["signalIds"]
    assert "Secret draft" not in payload["dailyBrief"]["body"]


def test_snapshot_ignores_nonpublished_brief(tmp_path):
    repo = repo_with_signal(tmp_path)
    repo.save_brief(DailyBrief(
        id="daily-brief-2026-08-14", window_start=NOW - timedelta(days=1),
        window_end=NOW, generated_at=NOW, body="Internal draft brief",
        status="draft", signal_ids=["signal-1"], top_call="Internal",
    ))

    assert build_snapshot(repo, generated_at=NOW)["dailyBrief"] is None


def test_invalid_nested_snapshot_keeps_previous_artifact(tmp_path, monkeypatch):
    target = tmp_path / "signal-radar.json"
    target.write_text('{"old": true}', encoding="utf-8")
    monkeypatch.setattr(signal_publish, "build_snapshot", lambda *_args, **_kwargs: {
        "schemaVersion": 1,
        "generatedAt": NOW.isoformat(),
        "health": {"status": "healthy"},
        "regime": {}, "signals": [], "themes": [], "catalysts": [], "dailyBrief": None,
    })

    with pytest.raises(RuntimeError, match="snapshot schema validation failed"):
        publish_snapshot(repo_with_signal(tmp_path), target, generated_at=NOW)

    assert json.loads(target.read_text(encoding="utf-8")) == {"old": True}
    assert not list(tmp_path.glob("*.tmp"))


def test_snapshot_validation_rejects_missing_cross_reference(tmp_path):
    payload = build_snapshot(repo_with_signal(tmp_path), generated_at=NOW)
    payload["themes"][0]["signalIds"] = ["missing-signal"]

    with pytest.raises(RuntimeError, match="unknown signal"):
        signal_publish.validate_snapshot(payload)
