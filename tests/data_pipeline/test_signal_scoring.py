from dataclasses import replace
from datetime import datetime, timedelta, timezone

from data_pipeline.signal_cluster import cluster_items
from data_pipeline.signal_domain import RawItem, SourceRecord, SourceTier
from data_pipeline.signal_rules import SignalDraft
from data_pipeline.signal_scoring import score_signal


NOW = datetime(2026, 8, 14, 8, tzinfo=timezone.utc)


def _context():
    source = SourceRecord(
        id="fund_sales", name="Fund sales", url="https://example.com/sales",
        source_tier=SourceTier.INDUSTRY, base_weight=.8,
    )
    raw = RawItem(
        source_id=source.id, url="https://example.com/sales/1", title="Fund demand",
        content_hash="abc", collected_at=NOW, published_at=NOW - timedelta(days=1),
    )
    cluster = cluster_items([raw], [])[0]
    draft = SignalDraft(
        category="demand", direction="positive", horizon="short_term",
        assets=["public-fund"], fund_keywords=["subscriptions"],
        themes=["customer-demand"], fact="Fund demand", transmission="Demand signal",
    )
    return {"source": source, "cluster": cluster, "draft": draft, "prior_topic_counts": [2] * 30, "as_of": NOW}


def test_real_customer_demand_outranks_media_heat_at_equal_evidence():
    same_context = _context()

    real = score_signal(demand_kind="customer_real", **same_context)
    media = score_signal(demand_kind="media_attention", **same_context)

    assert real.customer_demand_score == 1.0
    assert real.priority > media.priority


def test_policy_keeps_absent_customer_evidence_and_uses_neutral_floor():
    context = _context()
    policy = score_signal(draft=replace(context["draft"], category="policy"), demand_kind="unknown", **{
        key: value for key, value in context.items() if key != "draft"
    })

    assert policy.customer_demand_score is None
    assert policy.priority > 0
    assert policy.config_version


def test_recency_component_decays_by_configured_half_life():
    context = _context()
    fresh = score_signal(**context)
    old_cluster = cluster_items([
        RawItem(source_id="fund_sales", url="https://example.com/sales/old", title="Old demand", content_hash="old", collected_at=NOW - timedelta(days=7), published_at=NOW - timedelta(days=7))
    ], [])[0]

    old = score_signal(cluster=old_cluster, **{key: value for key, value in context.items() if key != "cluster"})

    assert fresh.recency_score > old.recency_score
