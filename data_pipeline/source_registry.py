import json
from pathlib import Path

from .signal_domain import SourceRecord, SourceTier


SUPPORTED_COLLECTORS = frozenset({"rss", "ics", "html_list"})
_REQUIRED_FIELDS = frozenset({
    "id", "name", "tier", "official", "base_weight", "collector", "url",
    "categories", "region", "enabled", "access_notes",
})


def load_source_registry(path) -> list[SourceRecord]:
    """Load a local, validated source registry without making network requests."""
    entries = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise ValueError("source registry must contain a JSON list")

    source_ids = set()
    sources = []
    for entry in entries:
        if not isinstance(entry, dict) or _REQUIRED_FIELDS - entry.keys():
            raise ValueError("source registry entry is missing required fields")
        source_id = entry["id"]
        if not isinstance(source_id, str) or not source_id or source_id in source_ids:
            raise ValueError("source registry contains duplicate or invalid id")
        if entry["collector"] not in SUPPORTED_COLLECTORS:
            raise ValueError("source registry contains an unknown collector")
        if not isinstance(entry["url"], str) or not entry["url"].startswith("https://"):
            raise ValueError("source registry URL must use HTTPS")
        if not isinstance(entry["base_weight"], (int, float)) or isinstance(entry["base_weight"], bool) or not 0 <= entry["base_weight"] <= 1:
            raise ValueError("source registry base_weight must be within [0, 1]")
        if not isinstance(entry["categories"], list) or not all(isinstance(value, str) for value in entry["categories"]):
            raise ValueError("source registry categories must be a list of strings")
        try:
            tier = SourceTier(entry["tier"])
        except ValueError as error:
            raise ValueError("source registry contains an invalid tier") from error

        source_ids.add(source_id)
        sources.append(SourceRecord(
            id=source_id, name=entry["name"], url=entry["url"], source_tier=tier,
            enabled=entry["enabled"], official=entry["official"],
            base_weight=float(entry["base_weight"]), collector=entry["collector"],
            categories=tuple(entry["categories"]), region=entry["region"],
            access_notes=entry["access_notes"], description=entry["access_notes"],
        ))
    return sources