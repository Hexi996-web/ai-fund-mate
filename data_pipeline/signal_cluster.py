"""Deterministic, local clustering for collected signal items."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import replace
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .signal_domain import EventCluster, RawItem


_TRACKING_PARAMETERS = frozenset({"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"})
_TOKEN_PATTERN = re.compile(r"[a-z0-9]+|[\u4e00-\u9fff]", re.IGNORECASE)
_SPACE_PATTERN = re.compile(r"\s+")
_RULES_PATH = Path(__file__).resolve().parents[1] / "config" / "signal_rules.json"


def normalize_url(url: str) -> str:
    """Remove presentation-only URL noise while retaining meaningful query fields."""
    parts = urlsplit(url.strip())
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if not key.lower().startswith("utm_") and key.lower() not in _TRACKING_PARAMETERS]
    netloc = parts.netloc.lower()
    if parts.scheme.lower() == "https" and netloc.endswith(":443"):
        netloc = netloc[:-4]
    if parts.scheme.lower() == "http" and netloc.endswith(":80"):
        netloc = netloc[:-3]
    return urlunsplit((parts.scheme.lower(), netloc, parts.path.rstrip("/") or "/", urlencode(sorted(query)), ""))


def content_fingerprint(item: RawItem) -> str:
    """Hash normalized editorial content, independent of collector tracking URLs."""
    text = "\n".join((_normalize_text(item.title), _normalize_text(item.body or item.content)))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def cluster_items(items: list[RawItem], existing_clusters: list[EventCluster]) -> list[EventCluster]:
    """Group near-duplicate items deterministically without external services."""
    topics, aliases = _load_cluster_configuration()
    clusters = list(existing_clusters)
    for item in sorted(items, key=lambda value: (content_fingerprint(value), value.source_id, normalize_url(value.url))):
        topic_key, category = _topic_for(item, topics)
        match_index = _matching_cluster(item, topic_key, clusters)
        if match_index is None:
            clusters.append(_new_cluster(item, topic_key, category))
        else:
            clusters[match_index] = _merge_item(clusters[match_index], item)
    return [_with_independent_count(cluster, aliases) for cluster in clusters]


def _normalize_text(value: str) -> str:
    return _SPACE_PATTERN.sub(" ", value or "").strip().casefold()


def _tokens(value: str) -> set[str]:
    return set(_TOKEN_PATTERN.findall(_normalize_text(value)))


def _item_text(item: RawItem) -> str:
    return f"{item.title}\n{item.body or item.content}"


def _cluster_text(cluster: EventCluster) -> str:
    return "\n".join(_item_text(item) for item in cluster.raw_items) if cluster.raw_items else f"{cluster.title}\n{cluster.summary}"


def _load_cluster_configuration() -> tuple[list[dict], dict[str, str]]:
    payload = json.loads(_RULES_PATH.read_text(encoding="utf-8"))
    return payload.get("cluster_topics", []), payload.get("publisher_group_aliases", {})


def _topic_for(item: RawItem, topics: list[dict]) -> tuple[str, str]:
    text = _normalize_text(_item_text(item))
    for topic in topics:
        if any(_normalize_text(term) in text for term in topic.get("match_any", [])):
            return topic["topic_key"], topic.get("category", "uncategorized")
    title = _normalize_text(item.title)
    return (f"topic-{hashlib.sha256(title.encode('utf-8')).hexdigest()[:12]}" if title else "untitled"), "uncategorized"


def _matching_cluster(item: RawItem, topic_key: str, clusters: list[EventCluster]) -> int | None:
    item_tokens = _tokens(_item_text(item))
    for index, cluster in enumerate(clusters):
        cluster_tokens = _tokens(_cluster_text(cluster))
        union = item_tokens | cluster_tokens
        jaccard = len(item_tokens & cluster_tokens) / len(union) if union else 0.0
        same_content = any(content_fingerprint(other) == content_fingerprint(item) for other in cluster.raw_items)
        same_topic = cluster.topic_key == topic_key or not cluster.topic_key or not topic_key
        if same_topic and (same_content or (jaccard >= 0.72 and _shares_publication_date(item, cluster))):
            return index
    return None


def _shares_publication_date(item: RawItem, cluster: EventCluster) -> bool:
    return item.published_at is not None and any(other.published_at and other.published_at.date() == item.published_at.date() for other in cluster.raw_items)


def _new_cluster(item: RawItem, topic_key: str, category: str) -> EventCluster:
    fingerprint = content_fingerprint(item)
    occurred_at = item.published_at or item.collected_at
    return EventCluster(id=f"cluster-{hashlib.sha256(f'{topic_key}|{fingerprint}'.encode('utf-8')).hexdigest()[:16]}", title=item.title, category=category, summary=item.body or item.content or item.title, topic_key=topic_key, item_count=1, independent_source_count=1, created_at=occurred_at, updated_at=occurred_at, raw_items=(item,))


def _merge_item(cluster: EventCluster, item: RawItem) -> EventCluster:
    raw_items = cluster.raw_items
    if not any(content_fingerprint(existing) == content_fingerprint(item) and existing.source_id == item.source_id for existing in raw_items):
        raw_items = raw_items + (item,)
    return replace(cluster, raw_items=raw_items, item_count=len(raw_items), updated_at=max(cluster.updated_at, item.published_at or item.collected_at))


def _with_independent_count(cluster: EventCluster, aliases: dict[str, str]) -> EventCluster:
    if not cluster.raw_items:
        return cluster
    groups = {aliases.get(item.source_id, item.metadata.get("publisher_group", item.source_id)) for item in cluster.raw_items}
    return replace(cluster, item_count=len(cluster.raw_items), independent_source_count=len(groups))
