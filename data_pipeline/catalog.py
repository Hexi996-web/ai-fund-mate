import json
from pathlib import Path
from urllib.parse import urlparse

from .domain import EvidenceType, IndicatorSpec, SourceSpec, Theme


class CatalogError(ValueError): pass


def _read(path: Path):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc: raise CatalogError(str(exc)) from exc


def load_source_catalog(path: Path):
    result = {}
    for item in _read(path):
        sid = item.get("id", "")
        if not sid or sid in result: raise CatalogError(f"duplicate source: {sid}")
        if urlparse(item.get("url", "")).scheme not in {"http", "https"}: raise CatalogError(f"invalid URL: {sid}")
        try: spec = SourceSpec(**item)
        except TypeError as exc: raise CatalogError(f"invalid source {sid}: {exc}") from exc
        if spec.timeout_seconds <= 0 or spec.max_retries < 0: raise CatalogError(f"invalid limits: {sid}")
        result[sid] = spec
    return result


def load_indicator_catalog(path: Path, sources):
    result = {}
    for item in _read(path):
        iid = item.get("id", "")
        if not iid or iid in result: raise CatalogError(f"duplicate indicator: {iid}")
        refs = [item.get("primary_source"), *item.get("backup_sources", [])]
        unknown = next((ref for ref in refs if ref not in sources), None)
        if unknown: raise CatalogError(f"unknown source: {unknown}")
        try:
            spec = IndicatorSpec(id=iid, theme=Theme(item["theme"]), evidence_type=EvidenceType(item["evidence_type"]),
                name=item["name"], unit=item["unit"], frequency=item["frequency"], primary_source=item["primary_source"],
                backup_sources=tuple(item.get("backup_sources", [])), stale_after_hours=item["stale_after_hours"],
                validation=item["validation"], is_estimate=item.get("is_estimate", False))
        except (KeyError, TypeError, ValueError) as exc: raise CatalogError(f"invalid indicator {iid}: {exc}") from exc
        if not spec.unit or spec.stale_after_hours <= 0 or not spec.validation: raise CatalogError(f"invalid indicator {iid}")
        result[iid] = spec
    return result
