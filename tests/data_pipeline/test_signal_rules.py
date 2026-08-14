from datetime import datetime, timezone
from pathlib import Path

from data_pipeline.signal_cluster import cluster_items
from data_pipeline.signal_domain import RawItem
from data_pipeline.signal_rules import load_signal_rules, classify_cluster


NOW = datetime(2026, 8, 14, tzinfo=timezone.utc)
RULES = load_signal_rules(Path("config/signal_rules.json"))


def cluster(source_id, title, body, **metadata):
    raw = RawItem(
        source_id=source_id, url=f"https://example.com/{source_id}", title=title,
        body=body, content=body, content_hash=source_id, collected_at=NOW,
        published_at=NOW, metadata=metadata,
    )
    return cluster_items([raw], [])[0]


def fed_rate_cluster():
    return cluster(
        "fed_rss", "Federal Reserve raises interest rate",
        "The rate decision may affect China capital flows and China fund liquidity.",
        region="US",
    )


def unrelated_us_local_cluster():
    return cluster(
        "us_local", "US city transport budget", "A local transit budget passed.", region="US",
    )


def test_overseas_item_requires_china_fund_transmission():
    assert classify_cluster(fed_rate_cluster(), RULES).themes == ["global-liquidity"]
    assert classify_cluster(unrelated_us_local_cluster(), RULES) is None


def test_rule_extracts_policy_direction_and_fund_keywords():
    draft = classify_cluster(
        cluster("csrc_policy", "Fund fee reform announced", "Fund management fees will decline.", region="CN"),
        RULES,
    )

    assert draft.category == "policy"
    assert draft.direction == "negative"
    assert draft.fund_keywords == ["fund fee"]


def test_rules_distinguish_real_customer_demand_from_proxy_and_attention():
    real = classify_cluster(cluster("fund_sales", "Fund subscriptions increase", "Investor subscriptions increased.", region="CN"), RULES)
    proxy = classify_cluster(cluster("market_data", "Fund assets under management rise", "Assets under management increased.", region="CN"), RULES)
    attention = classify_cluster(cluster("media", "Fund topic search interest rises", "Media coverage increased.", region="CN"), RULES)

    assert real.demand_kind == "customer_real"
    assert proxy.demand_kind == "customer_proxy"
    assert attention.demand_kind == "media_attention"


def test_china_mention_without_fund_or_capital_market_channel_is_rejected():
    china_only = cluster("fed_rss", "Federal Reserve raises interest rate", "The decision affects China exports and bilateral diplomacy.", region="US")

    assert classify_cluster(china_only, RULES) is None


def test_real_redemptions_have_negative_direction_and_correct_keyword():
    draft = classify_cluster(cluster("fund_sales", "Fund redemptions increase", "Investor fund redemptions increased.", region="CN"), RULES)

    assert draft.demand_kind == "customer_real"
    assert draft.direction == "negative"
    assert draft.fund_keywords == ["redemptions"]


def test_media_attention_takes_precedence_over_subscription_mentions():
    draft = classify_cluster(cluster("media", "Search interest in fund subscriptions rises", "Media coverage of subscriptions increased.", region="CN"), RULES)

    assert draft.demand_kind == "media_attention"
    assert draft.category == "attention"