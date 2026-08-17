from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from data_pipeline.catalysts import attach_outcome, normalize_catalysts
from data_pipeline.signal_domain import RawItem, ValidationStatus


SHANGHAI = ZoneInfo("Asia/Shanghai")
AS_OF = datetime(2026, 8, 14, 8, tzinfo=SHANGHAI)


def raw_item(title, scheduled_at, *, url="https://example.test/event", body="", metadata=None):
    return RawItem(
        source_id="official-calendar", url=url, title=title, body=body,
        content=body, content_hash=f"{title}-{scheduled_at.isoformat()}",
        collected_at=AS_OF, published_at=scheduled_at, metadata=metadata or {},
    )


def test_normalize_catalysts_keeps_only_the_next_seven_days_and_stable_links():
    current = raw_item("Today event", AS_OF, url="https://example.test/today", body="Decision at noon")
    upcoming = raw_item("Week event", AS_OF + timedelta(days=6, hours=23), url="https://example.test/week")
    boundary = raw_item("Outside preview", AS_OF + timedelta(days=7), url="https://example.test/boundary")
    past = raw_item("Past event", AS_OF - timedelta(seconds=1), url="https://example.test/past")

    catalysts = normalize_catalysts([boundary, past, upcoming, current], AS_OF)

    assert [item.title for item in catalysts] == ["Today event", "Week event"]
    assert all(item.id.startswith("catalyst-") for item in catalysts)
    assert catalysts[0].description == "Decision at noon\nhttps://example.test/today"


def test_normalize_catalysts_preserves_supplied_signal_and_validation_status():
    event = raw_item(
        "Official release", AS_OF + timedelta(hours=2),
        metadata={"signal_id": "signal-7", "priority": 4, "validation_status": "confirmed"},
    )

    catalyst = normalize_catalysts([event], AS_OF)[0]

    assert catalyst.signal_id == "signal-7"
    assert catalyst.priority == 4
    assert catalyst.validation_status is ValidationStatus.CONFIRMED


def test_attach_outcome_archives_outcome_text_and_link_without_mutating_catalyst():
    catalyst = normalize_catalysts([raw_item("Rate decision", AS_OF + timedelta(hours=1))], AS_OF)[0]
    outcome = raw_item("Rate decision outcome", AS_OF + timedelta(hours=2), url="https://example.test/outcome", body="Rate held")

    archived = attach_outcome(catalyst, outcome)

    assert catalyst.description == "https://example.test/event"
    assert "Outcome: Rate held" in archived.description
    assert "https://example.test/outcome" in archived.description
    assert archived.validation_status is ValidationStatus.PENDING_OFFICIAL_VALIDATION


def test_attach_outcome_is_idempotent_and_keeps_unclassified_outcomes_pending():
    catalyst = normalize_catalysts([raw_item("Rate decision", AS_OF + timedelta(hours=1))], AS_OF)[0]
    outcome = raw_item("Rate decision outcome", AS_OF + timedelta(hours=2), url="https://example.test/outcome", body="Rate held")

    first = attach_outcome(catalyst, outcome)
    retried = attach_outcome(first, outcome)

    assert retried == first
    assert retried.validation_status is ValidationStatus.PENDING_OFFICIAL_VALIDATION
    assert "pending official validation" in retried.description
