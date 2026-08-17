"""Fail scheduled publication when a generated snapshot is missing or stale."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def _timestamp(payload: dict, field: str) -> datetime:
    value = payload.get(field)
    if not isinstance(value, str):
        raise ValueError(f"missing {field}")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate(
    path: Path,
    field: str,
    max_age_hours: int,
    now: datetime | None = None,
    minimum_items: dict[str, int] | None = None,
) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    observed = _timestamp(payload, field)
    age = (now or datetime.now(timezone.utc)) - observed
    if age.total_seconds() < -3600 or age.total_seconds() > max_age_hours * 3600:
        raise ValueError(f"{path} is stale: {field}={observed.isoformat()}, age={age}")
    for key, minimum in (minimum_items or {}).items():
        items = payload.get(key)
        count = len(items) if isinstance(items, list) else 0
        if count < minimum:
            raise ValueError(f"{path} has only {count} {key}; minimum is {minimum}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--field", required=True)
    parser.add_argument("--max-age-hours", type=int, required=True)
    parser.add_argument(
        "--min-items", action="append", default=[], metavar="FIELD=COUNT",
        help="reject publication when an array has fewer than COUNT items",
    )
    args = parser.parse_args()
    minimum_items = {}
    for requirement in args.min_items:
        key, separator, value = requirement.partition("=")
        if not separator or not key or not value.isdigit():
            parser.error("--min-items must use FIELD=COUNT")
        minimum_items[key] = int(value)
    validate(args.path, args.field, args.max_age_hours, minimum_items=minimum_items)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
