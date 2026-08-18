from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from data_pipeline.daily_brief import brief_window, build_daily_brief
from data_pipeline.signal_domain import (
    CatalystRecord,
    DemandKind,
    RawItem,
    SignalEvidence,
    SignalRecord,
    ValidationStatus,
)


SHANGHAI = ZoneInfo("Asia/Shanghai")
RUN_AT = datetime(2026, 8, 14, 7, tzinfo=SHANGHAI)


class Repository:
    def __init__(self, signals=(), catalysts=()):
        self._signals = list(signals)
        self._catalysts = list(catalysts)

    def list_signals(self):
        return list(self._signals)

    def list_catalysts(self):
        return list(self._catalysts)


def signal(signal_id, timestamp, *, priority=1, validation=ValidationStatus.CONFIRMED,
           demand_kind=DemandKind.UNKNOWN, title=None):
    return SignalRecord(
        id=signal_id, cluster_id=None, category="policy", title=title or signal_id,
        summary=f"summary for {signal_id}", priority=priority, source_confidence=.9,
        customer_demand_score=.5, demand_kind=demand_kind, validation_status=validation,
        published_at=timestamp, created_at=timestamp, updated_at=timestamp,
    )


def test_daily_window_is_previous_0700_to_current_0700_shanghai():
    start, end = brief_window(datetime(2026, 8, 14, 7, 0, tzinfo=SHANGHAI))

    assert start.isoformat() == "2026-08-13T07:00:00+08:00"
    assert end.isoformat() == "2026-08-14T07:00:00+08:00"


def test_daily_window_before_0700_uses_the_last_completed_boundary():
    start, end = brief_window(datetime(2026, 8, 14, 6, 0, tzinfo=SHANGHAI))

    assert start.isoformat() == "2026-08-12T07:00:00+08:00"
    assert end.isoformat() == "2026-08-13T07:00:00+08:00"


def test_daily_window_uses_shanghai_boundary_for_a_utc_run_time():
    start, end = brief_window(datetime(2026, 8, 13, 23, 0, tzinfo=ZoneInfo("UTC")))

    assert start.isoformat() == "2026-08-13T07:00:00+08:00"
    assert end.isoformat() == "2026-08-14T07:00:00+08:00"


def test_signal_at_exact_end_is_excluded():
    start, end = brief_window(RUN_AT)
    repo = Repository([
        signal("before-boundary", end - timedelta(seconds=1), priority=4),
        signal("at-boundary", end, priority=9),
    ])

    brief = build_daily_brief(repo, RUN_AT)

    assert brief.signal_ids == ["before-boundary"]


def test_no_material_news_is_an_explicit_brief():
    brief = build_daily_brief(Repository(), RUN_AT)

    assert brief.top_call == "过去24小时无重大新增信号"
    assert "过去24小时无重大新增信号" in brief.body


def test_top_call_uses_highest_valid_priority_and_keeps_unverified_media_as_observation():
    start, _ = brief_window(RUN_AT)
    repo = Repository([
        signal("confirmed", start + timedelta(hours=1), priority=4, title="Confirmed policy"),
        signal("media-only", start + timedelta(hours=2), priority=9, title="Media rumor",
               validation=ValidationStatus.PENDING_OFFICIAL_VALIDATION,
               demand_kind=DemandKind.MEDIA_ATTENTION),
    ])

    brief = build_daily_brief(repo, RUN_AT)

    assert "confirmed" in brief.top_call
    assert "media-only" not in brief.top_call
    assert brief.signal_ids == ["media-only", "confirmed"]
    assert "待官方验证" in brief.body


def test_top_call_excludes_higher_priority_rejected_and_pending_signals():
    start, _ = brief_window(RUN_AT)
    repo = Repository([
        signal("confirmed", start + timedelta(hours=1), priority=4, title="Confirmed policy"),
        signal("rejected", start + timedelta(hours=2), priority=10, title="Retracted report",
               validation=ValidationStatus.REJECTED),
        signal("pending", start + timedelta(hours=3), priority=9, title="Unverified report",
               validation=ValidationStatus.PENDING_OFFICIAL_VALIDATION),
    ])

    brief = build_daily_brief(repo, RUN_AT)

    assert "confirmed" in brief.top_call
    assert "rejected" not in brief.top_call
    assert "pending" not in brief.top_call
    assert "\u5df2\u62d2\u7edd\u6216\u5931\u6548" in brief.body


def test_daily_brief_is_deterministic_and_includes_evidence_links_when_available():
    start, _ = brief_window(RUN_AT)
    item = signal("signal-1", start + timedelta(hours=1), priority=3)
    repo = Repository([item])

    first = build_daily_brief(repo, RUN_AT)
    second = build_daily_brief(repo, RUN_AT)

    assert first == second
    assert "[signal-1]" in first.body


def test_daily_brief_excludes_draft_linked_catalyst_but_keeps_standalone_event():
    start, end = brief_window(RUN_AT)
    published = signal("published", start + timedelta(hours=1))
    draft = signal("draft", start + timedelta(hours=2))
    draft = replace(draft, published_at=None)
    catalysts = [
        CatalystRecord(
            id="draft-catalyst", signal_id="draft", title="Draft secret",
            scheduled_at=end + timedelta(days=1), priority=5,
        ),
        CatalystRecord(
            id="standalone", signal_id=None, title="Standalone event",
            scheduled_at=end + timedelta(days=2), priority=4,
        ),
    ]

    brief = build_daily_brief(Repository([published, draft], catalysts), RUN_AT)

    assert "draft-catalyst" not in brief.body
    assert "Draft secret" not in brief.body
    assert "[standalone]" in brief.body


def test_daily_brief_sorts_and_deduplicates_evidence_links_from_any_repository_order():
    start, _ = brief_window(RUN_AT)
    item = signal("signal-1", start + timedelta(hours=1), priority=3)

    class EvidenceRepository(Repository):
        def list_signal_evidence(self, _signal_id):
            return [
                SignalEvidence(id=2, signal_id="signal-1", raw_item_id=2, evidence_type="policy", excerpt="", source_confidence=.9),
                SignalEvidence(id=1, signal_id="signal-1", raw_item_id=1, evidence_type="policy", excerpt="", source_confidence=.9),
                SignalEvidence(id=3, signal_id="signal-1", raw_item_id=3, evidence_type="policy", excerpt="", source_confidence=.9),
            ]

        def get_raw_item(self, raw_item_id):
            url = {1: "https://example.test/a", 2: "https://example.test/z", 3: "https://example.test/a"}[raw_item_id]
            return RawItem(source_id="official", url=url, title="Evidence", content_hash=str(raw_item_id), collected_at=RUN_AT)

    brief = build_daily_brief(EvidenceRepository([item]), RUN_AT)

    assert "(https://example.test/a, https://example.test/z)" in brief.body
