from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest

from data_pipeline.signal_cluster import cluster_items
from data_pipeline.signal_config import configuration_fingerprint
from data_pipeline.signal_domain import RawItem, SourceRecord, SourceTier
from data_pipeline.signal_rules import SignalDraft
from data_pipeline.signal_scoring import default_config, score_signal


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


def test_scoring_rejects_unversioned_custom_configuration():
    config = default_config()
    del config["version"]

    with pytest.raises(ValueError, match="version"):
        score_signal(config=config, **_context())


@pytest.mark.parametrize("path, value", [
    (("scoring", "recency_half_life_days"), 0),
    (("scoring", "weights", "source"), float("nan")),
    (("scoring", "customer_demand", "customer_real"), 1.1),
])
def test_scoring_rejects_invalid_numeric_configuration(path, value):
    config = default_config()
    target = config
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    with pytest.raises(ValueError):
        score_signal(config=config, **_context())


def test_scoring_rejects_incomplete_configuration_instead_of_defaulting():
    config = deepcopy(default_config())
    del config["scoring"]["weights"]["impact"]

    with pytest.raises(ValueError, match="impact"):
        score_signal(config=config, **_context())


def test_scoring_rejects_nonfinite_source_component_input():
    context = _context()
    source = replace(context["source"], base_weight=float("nan"))

    with pytest.raises(ValueError, match="source.base_weight"):
        score_signal(source=source, **{key: value for key, value in context.items() if key != "source"})

def test_scoring_rejects_empty_custom_configuration_instead_of_loading_defaults():
    with pytest.raises(ValueError, match="version"):
        score_signal(config={}, **_context())

def test_same_version_scoring_configs_persist_distinct_fingerprints():
    first_config = default_config()
    second_config = deepcopy(first_config)
    second_config["scoring"]["weights"]["source"] = .10

    first = score_signal(config=first_config, **_context())
    second = score_signal(config=second_config, **_context())

    assert first.config_version == second.config_version == "1.1"
    assert first.config_fingerprint != second.config_fingerprint
    assert first.priority != second.priority


def test_configuration_fingerprint_is_independent_of_mapping_key_order():
    config = default_config()
    reordered = {
        "anomaly": dict(reversed(list(config["anomaly"].items()))),
        "scoring": {
            "category_impact": dict(reversed(list(config["scoring"]["category_impact"].items()))),
            "default_impact": config["scoring"]["default_impact"],
            "independent_source_reference": config["scoring"]["independent_source_reference"],
            "recency_half_life_days": config["scoring"]["recency_half_life_days"],
            "customer_demand": dict(reversed(list(config["scoring"]["customer_demand"].items()))),
            "weights": dict(reversed(list(config["scoring"]["weights"].items()))),
        },
        "version": config["version"],
    }

    assert configuration_fingerprint(config) == configuration_fingerprint(reordered)