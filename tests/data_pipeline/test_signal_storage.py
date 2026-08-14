import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from data_pipeline.signal_domain import (
    CatalystRecord,
    DailyBrief,
    DemandKind,
    EventCluster,
    PipelineRun,
    RawItem,
    SignalEvidence,
    SignalRecord,
    SourceRecord,
    SourceTier,
    ValidationStatus,
)
from data_pipeline.signal_storage import SignalRepository


NOW = datetime(2026, 8, 14, 0, 0, tzinfo=timezone.utc)


def sample_source():
    return SourceRecord(
        id="pbc", name="People's Bank of China", url="https://www.pbc.gov.cn",
        source_tier=SourceTier.OFFICIAL, enabled=True,
    )


def sample_raw_item(content_hash="raw-1"):
    return RawItem(
        source_id="pbc", url="https://www.pbc.gov.cn/news/1", title="Policy update",
        content="Policy text", content_hash=content_hash, collected_at=NOW, published_at=NOW,
    )


def sample_signal(**overrides):
    values = {
        "id": "sig-1", "cluster_id": "cluster-1", "category": "policy", "title": "Liquidity signal",
        "summary": "A policy signal", "priority": 3, "source_confidence": 0.7,
        "customer_demand_score": 0.5, "validation_status": ValidationStatus.CONFIRMED,
        "created_at": NOW, "updated_at": NOW,
    }
    values.update(overrides)
    return SignalRecord(**values)


def initialized_repo(tmp_path):
    repo = SignalRepository(tmp_path / "signals.db")
    repo.initialize()
    repo.upsert_source(sample_source())
    repo.upsert_cluster(EventCluster(id="cluster-1", title="Liquidity", category="policy", created_at=NOW, updated_at=NOW))
    return repo


def test_raw_items_are_idempotent_by_content_hash(tmp_path):
    repo = SignalRepository(tmp_path / "signals.db")
    repo.initialize()
    first = repo.save_raw_item(sample_raw_item(content_hash="abc"))
    second = repo.save_raw_item(sample_raw_item(content_hash="abc"))
    assert first.id == second.id
    assert repo.count_raw_items() == 1


def test_signal_keeps_separate_score_components(tmp_path):
    repo = initialized_repo(tmp_path)
    repo.upsert_signal(sample_signal(source_confidence=.9, customer_demand_score=1.0))
    row = repo.get_signal("sig-1")
    assert row.source_confidence == .9
    assert row.customer_demand_score == 1.0


def test_repository_persists_signal_relationships_and_run_artifacts(tmp_path):
    repo = initialized_repo(tmp_path)
    raw_item = repo.save_raw_item(sample_raw_item())
    repo.upsert_signal(sample_signal())
    repo.replace_signal_evidence([
        SignalEvidence(signal_id="sig-1", raw_item_id=raw_item.id, evidence_type="policy", excerpt="Policy text", source_confidence=0.8),
    ])
    repo.upsert_catalyst(CatalystRecord(
        id="cat-1", signal_id="sig-1", title="Rate decision", scheduled_at=NOW, priority=2,
    ))
    repo.save_brief(DailyBrief(
        id="brief-1", window_start=NOW, window_end=NOW, generated_at=NOW, body="Daily brief",
    ))
    repo.record_run(PipelineRun(id="run-1", command="collect", started_at=NOW, status="success", summary="ok", finished_at=NOW))

    assert repo.list_signal_evidence("sig-1")[0].raw_item_id == raw_item.id
    assert repo.list_catalysts()[0].signal_id == "sig-1"
    assert repo.get_brief("brief-1").body == "Daily brief"
    assert repo.get_run("run-1").status == "success"


def test_repository_round_trips_downstream_domain_fields_and_signal_updates(tmp_path):
    repo = initialized_repo(tmp_path)
    raw_item = repo.save_raw_item(RawItem(
        source_id="pbc", url="https://www.pbc.gov.cn/news/2", title="Demand update",
        body="Customer subscription data", content_hash="raw-fields", collected_at=NOW,
        content_status="complete",
    ))
    cluster = EventCluster(
        id="cluster-1", title="Liquidity", category="policy", summary="Updated",
        topic_key="liquidity", item_count=4, independent_source_count=2,
        created_at=NOW, updated_at=NOW,
    )
    repo.upsert_cluster(cluster)
    repo.upsert_signal(sample_signal(priority=3, customer_demand_score=0.5))
    repo.upsert_signal(sample_signal(priority=5, customer_demand_score=1.0))
    repo.save_brief(DailyBrief(
        id="brief-fields", window_start=NOW, window_end=NOW, generated_at=NOW,
        body="Daily brief", signal_ids=["sig-1"], top_call="Increase attention",
    ))

    assert raw_item.body == "Customer subscription data"
    assert raw_item.content_status == "complete"
    assert repo.get_cluster("cluster-1").topic_key == "liquidity"
    assert repo.get_cluster("cluster-1").item_count == 4
    assert repo.get_cluster("cluster-1").independent_source_count == 2
    assert repo.get_signal("sig-1").priority == 5
    assert repo.get_brief("brief-fields").signal_ids == ["sig-1"]
    assert repo.get_brief("brief-fields").top_call == "Increase attention"


def test_evidence_requires_existing_signal_and_raw_item(tmp_path):
    repo = SignalRepository(tmp_path / "signals.db")
    repo.initialize()

    with pytest.raises(sqlite3.IntegrityError):
        repo.replace_signal_evidence([
            SignalEvidence(signal_id="missing", raw_item_id=999, evidence_type="policy", excerpt="x", source_confidence=0.8),
        ])


def test_repository_uses_required_indexes_and_utc_timestamps(tmp_path):
    repo = SignalRepository(tmp_path / "signals.db")
    repo.initialize()
    local_time = datetime(2026, 8, 14, 8, tzinfo=timezone(timedelta(hours=8)))
    saved = repo.save_raw_item(RawItem(
        source_id="pbc", url="https://www.pbc.gov.cn/news/3", title="UTC update",
        body="text", content_hash="raw-utc", collected_at=local_time,
    ))
    with sqlite3.connect(repo.db_path) as connection:
        indexes = {row[1] for row in connection.execute("SELECT type, name FROM sqlite_master WHERE type='index'")}

    assert saved.collected_at == NOW
    assert {"raw_items_published_at_idx", "signals_category_priority_idx", "signals_cluster_id_idx", "catalysts_scheduled_at_idx"} <= indexes

def test_title_only_raw_item_preserves_nullable_body(tmp_path):
    repo = SignalRepository(tmp_path / "signals.db")
    repo.initialize()
    saved = repo.save_raw_item(RawItem(
        source_id="pbc", url="https://www.pbc.gov.cn/news/title-only", title="Title only",
        body=None, content_status="title_only", content_hash="raw-title-only", collected_at=NOW,
    ))

    assert saved.body is None
    assert repo.get_raw_item(saved.id).body is None
