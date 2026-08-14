from dataclasses import replace
from datetime import datetime, timezone

from data_pipeline.signal_cluster import cluster_items, content_fingerprint, normalize_url
from data_pipeline.signal_domain import RawItem


NOW = datetime(2026, 8, 14, tzinfo=timezone.utc)


def item(source_id, url, title, body, **metadata):
    return RawItem(
        source_id=source_id,
        url=url,
        title=title,
        body=body,
        content=body,
        content_hash=f"{source_id}-{title}",
        collected_at=NOW,
        published_at=NOW,
        metadata=metadata,
    )


def agency_original():
    return item(
        "agency_original", "https://agency.example/policy?id=7&utm_source=wire",
        "Fund fee reform announced", "The regulator announced fund fee reform today.",
    )


def portal_reprint():
    return item(
        "portal_reprint", "https://portal.example/story/7?fbclid=tracking",
        "Fund fee reform announced", "The regulator announced fund fee reform today.",
    )


def test_normalize_url_removes_tracking_and_fragment_but_preserves_business_query():
    assert normalize_url("HTTPS://Example.com:443/a/?b=2&utm_source=x&a=1#section") == "https://example.com/a?a=1&b=2"


def test_fingerprint_is_stable_for_equivalent_whitespace_and_url_tracking():
    original = agency_original()
    equivalent = item(
        "agency_original", "https://agency.example/policy?id=7&utm_medium=email",
        " fund   fee reform announced ", "The regulator announced\n fund fee reform today.",
    )

    assert content_fingerprint(original) == content_fingerprint(equivalent)


def test_syndicated_articles_count_as_one_independent_source():
    unrelated = item(
        "other_official", "https://example.cn/statistics/1", "Inflation release",
        "Consumer prices rose in July.",
    )

    clusters = cluster_items([agency_original(), portal_reprint(), unrelated], [])

    policy = next(cluster for cluster in clusters if cluster.topic_key == "fund_fee_reform")
    assert policy.item_count == 2
    assert policy.independent_source_count == 1


def test_matching_existing_cluster_keeps_its_identifier():
    first = cluster_items([agency_original()], [])
    repeated = cluster_items([portal_reprint()], first)

    assert repeated[0].id == first[0].id



def test_chinese_syndication_clusters_on_shared_entity_tokens():
    original = item("wire_a", "https://wire.example/1", "基金费率改革方案发布", "监管机构发布基金费率改革方案。", publisher_group="wire")
    reprint = item("wire_b", "https://portal.example/1", "基金费率改革方案发布", "监管机构正式发布基金费率改革方案。", publisher_group="wire")

    clusters = cluster_items([original, reprint], [])

    assert len(clusters) == 1
    assert clusters[0].independent_source_count == 1

def test_exact_syndication_clusters_when_publication_time_is_missing():
    original = replace(agency_original(), published_at=None)
    reprint = replace(portal_reprint(), published_at=None)

    clusters = cluster_items([original, reprint], [])

    assert len(clusters) == 1
    assert clusters[0].item_count == 2