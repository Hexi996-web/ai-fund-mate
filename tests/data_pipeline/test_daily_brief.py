from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from data_pipeline.daily_brief import brief_window, build_daily_brief
from data_pipeline.signal_domain import DemandKind, SignalRecord, ValidationStatus


SHANGHAI = ZoneInfo("Asia/Shanghai")
RUN_AT = datetime(2026, 8, 14, 8, tzinfo=SHANGHAI)


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


def test_daily_window_is_previous_0800_to_current_0800_shanghai():
    start, end = brief_window(datetime(2026, 8, 14, 8, 0, tzinfo=SHANGHAI))

    assert start.isoformat() == "2026-08-13T08:00:00+08:00"
    assert end.isoformat() == "2026-08-14T08:00:00+08:00"


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


def test_daily_brief_is_deterministic_and_includes_evidence_links_when_available():
    start, _ = brief_window(RUN_AT)
    item = signal("signal-1", start + timedelta(hours=1), priority=3)
    repo = Repository([item])

    first = build_daily_brief(repo, RUN_AT)
    second = build_daily_brief(repo, RUN_AT)

    assert first == second
    assert "[signal-1]" in first.body
