"""Build and atomically publish the frontend signal-intelligence snapshot."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .daily_brief import brief_window


SCHEMA_VERSION = 1


def build_snapshot(repo, generated_at: datetime | None = None) -> dict[str, Any]:
    """Return the storage-neutral, browser-safe snapshot contract."""
    generated_at = _aware(generated_at or datetime.now(timezone.utc))
    signals = [_signal_payload(repo, signal) for signal in repo.list_signals() if signal.published_at is not None]
    catalysts = [_catalyst_payload(item) for item in repo.list_catalysts()]
    brief = _current_brief(repo, generated_at)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at.astimezone(timezone.utc).isoformat(),
        "health": health_payload(repo, generated_at),
        "regime": {
            "status": "neutral",
            "label": "neutral",
            "rationale": [],
        },
        "signals": signals,
        "themes": _themes(signals),
        "catalysts": catalysts,
        "dailyBrief": _brief_payload(brief) if brief is not None else None,
    }


def publish_snapshot(repo, target, generated_at: datetime | None = None) -> dict[str, Any]:
    """Replace ``target`` only after a complete JSON snapshot is durable."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = build_snapshot(repo, generated_at=generated_at)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=target.parent,
            prefix=f".{target.name}.",
            suffix=".tmp",
            delete=False,
            newline="\n",
        ) as temporary:
            temporary_path = Path(temporary.name)
            json.dump(payload, temporary, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, target)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return payload


def health_payload(repo, generated_at: datetime | None = None, *, backend: str | None = None) -> dict[str, Any]:
    generated_at = _aware(generated_at or datetime.now(timezone.utc))
    runs = repo.list_runs()
    latest = runs[0] if runs else None
    latest_success = next((run for run in runs if run.status == "success"), None)
    return {
        "status": "healthy" if latest is not None and latest.status == "success" else "degraded",
        "backend": backend or ("sqlite" if hasattr(repo, "db_path") else "postgresql"),
        "lastSuccessfulUpdate": _iso(latest_success.finished_at or latest_success.started_at) if latest_success else None,
        "signalCount": len(repo.list_signals()),
        "catalystCount": len(repo.list_catalysts()),
        "rawItemCount": repo.count_raw_items(),
    }


def _signal_payload(repo, signal) -> dict[str, Any]:
    sources = []
    for evidence in repo.list_signal_evidence(signal.id):
        item = repo.get_raw_item(evidence.raw_item_id)
        if item is None or not item.url:
            continue
        candidate = {
            "url": item.url,
            "excerpt": evidence.excerpt,
            "confidence": evidence.source_confidence,
        }
        if candidate not in sources:
            sources.append(candidate)
    sources.sort(key=lambda item: (item["url"], item["excerpt"], item["confidence"]))
    return {
        "id": signal.id,
        "clusterId": signal.cluster_id,
        "category": signal.category,
        "title": signal.title,
        "summary": signal.summary,
        "priority": signal.priority,
        "sourceConfidence": signal.source_confidence,
        "customerDemandScore": signal.customer_demand_score,
        "demandKind": signal.demand_kind.value,
        "validationStatus": signal.validation_status.value,
        "publishedAt": _iso(signal.published_at),
        "updatedAt": _iso(signal.updated_at),
        "sources": sources,
    }


def _catalyst_payload(catalyst) -> dict[str, Any]:
    return {
        "id": catalyst.id,
        "signalId": catalyst.signal_id,
        "title": catalyst.title,
        "scheduledAt": _iso(catalyst.scheduled_at),
        "priority": catalyst.priority,
        "description": catalyst.description,
        "validationStatus": catalyst.validation_status.value,
    }


def _brief_payload(brief) -> dict[str, Any]:
    return {
        "id": brief.id,
        "windowStart": _iso(brief.window_start),
        "windowEnd": _iso(brief.window_end),
        "generatedAt": _iso(brief.generated_at),
        "body": brief.body,
        "status": brief.status,
        "signalIds": list(brief.signal_ids),
        "topCall": brief.top_call,
    }


def _current_brief(repo, generated_at: datetime):
    _, completed_boundary = brief_window(generated_at)
    return repo.get_brief(f"daily-brief-{completed_boundary.date().isoformat()}")


def _themes(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    categories: dict[str, list[str]] = {}
    for signal in signals:
        categories.setdefault(signal["category"], []).append(signal["id"])
    return [
        {"id": category, "title": category, "signalIds": signal_ids}
        for category, signal_ids in sorted(categories.items())
    ]


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("generated_at must be timezone-aware")
    return value


def _iso(value: datetime | None) -> str | None:
    return value.astimezone(timezone.utc).isoformat() if value is not None else None
