"""Normalize public calendar events into traceable, upcoming catalysts."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any, Iterable, Mapping

from .signal_domain import CatalystRecord, ValidationStatus


PREVIEW_DAYS = 7


def normalize_catalysts(raw_items: Iterable[Any], as_of: datetime) -> list[CatalystRecord]:
    """Return the deterministic, half-open seven-day catalyst preview.

    Calendar collectors use ``published_at`` for the event instant.  A producer
    with an explicit ``metadata.scheduled_at`` takes precedence, which lets a
    later parser retain both a publication and a calendar timestamp.
    """
    as_of = _aware(as_of, "as_of")
    end = as_of + timedelta(days=PREVIEW_DAYS)
    catalysts = []
    for raw_item in raw_items:
        scheduled_at = _scheduled_at(raw_item)
        if scheduled_at is None or not as_of <= scheduled_at < end:
            continue
        title = str(_value(raw_item, "title", "Untitled"))
        url = str(_value(raw_item, "url", ""))
        metadata = _metadata(raw_item)
        catalysts.append(CatalystRecord(
            id=_catalyst_id(raw_item, scheduled_at),
            signal_id=_optional_text(metadata.get("signal_id")),
            title=title,
            scheduled_at=scheduled_at,
            priority=_priority(metadata.get("priority", 0)),
            description=_description(raw_item),
            validation_status=_validation_status(metadata.get("validation_status")),
        ))
    return sorted(catalysts, key=lambda item: (item.scheduled_at, -item.priority, item.id))


def attach_outcome(catalyst: CatalystRecord, raw_item: Any) -> CatalystRecord:
    """Archive a traceable outcome once, retaining its validation state."""
    outcome = _description(raw_item)
    if not outcome:
        outcome = str(_value(raw_item, "title", "Outcome unavailable"))
    metadata = _metadata(raw_item)
    status = _validation_status(metadata.get("validation_status"))
    suffix = f"Outcome: {outcome}"
    if status is ValidationStatus.PENDING_OFFICIAL_VALIDATION:
        suffix = f"{suffix}\nStatus: pending official validation"
    if suffix in catalyst.description:
        return catalyst
    description = "\n".join(part for part in (catalyst.description, suffix) if part)
    return replace(catalyst, description=description, validation_status=status)


def _scheduled_at(raw_item: Any) -> datetime | None:
    metadata = _metadata(raw_item)
    value = metadata.get("scheduled_at", _value(raw_item, "published_at", None))
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return _aware(value, "scheduled_at") if isinstance(value, datetime) else None


def _catalyst_id(raw_item: Any, scheduled_at: datetime) -> str:
    raw_id = _value(raw_item, "id", None)
    if raw_id is not None:
        return f"catalyst-{raw_id}"
    stable_value = "|".join((
        str(_value(raw_item, "source_id", "")),
        str(_value(raw_item, "url", "")),
        str(_value(raw_item, "title", "")),
        scheduled_at.astimezone(timezone.utc).isoformat(),
    ))
    return f"catalyst-{sha256(stable_value.encode('utf-8')).hexdigest()[:16]}"


def _description(raw_item: Any) -> str:
    body = _value(raw_item, "body", None) or _value(raw_item, "content", "") or ""
    url = str(_value(raw_item, "url", ""))
    return "\n".join(str(part).strip() for part in (body, url) if str(part).strip())


def _metadata(raw_item: Any) -> Mapping[str, Any]:
    value = _value(raw_item, "metadata", {})
    return value if isinstance(value, Mapping) else {}


def _value(subject: Any, name: str, default: Any) -> Any:
    return subject.get(name, default) if isinstance(subject, Mapping) else getattr(subject, name, default)


def _aware(value: datetime, name: str) -> datetime:
    if value.tzinfo is None:
        raise ValueError(f"{name} must be timezone-aware")
    return value


def _optional_text(value: Any) -> str | None:
    return str(value) if value not in (None, "") else None


def _priority(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _validation_status(value: Any, default: ValidationStatus = ValidationStatus.PENDING_OFFICIAL_VALIDATION) -> ValidationStatus:
    try:
        return ValidationStatus(value) if value is not None else default
    except ValueError:
        return default
