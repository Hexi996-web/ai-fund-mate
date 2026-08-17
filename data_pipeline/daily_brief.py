"""Build a deterministic, evidence-linked Beijing-time signal brief."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable
from zoneinfo import ZoneInfo

from .signal_domain import DailyBrief, DemandKind, SignalRecord, ValidationStatus


SHANGHAI = ZoneInfo("Asia/Shanghai")
EMPTY_TOP_CALL = "过去24小时无重大新增信号"


def brief_window(run_at: datetime, timezone: ZoneInfo = SHANGHAI) -> tuple[datetime, datetime]:
    """Return `[previous 08:00, current 08:00)` in the requested timezone."""
    if run_at.tzinfo is None:
        raise ValueError("run_at must be timezone-aware")
    local_run = run_at.astimezone(timezone)
    end = local_run.replace(hour=8, minute=0, second=0, microsecond=0)
    if local_run < end:
        end -= timedelta(days=1)
    return end - timedelta(days=1), end


def build_daily_brief(repo, run_at: datetime) -> DailyBrief:
    """Produce a stable two-minute payload without treating media attention as fact."""
    start, end = brief_window(run_at)
    all_signals = repo.list_signals()
    signals = _window_signals(all_signals, start, end)
    published_signal_ids = {
        signal.id for signal in all_signals if signal.published_at is not None
    }
    catalysts = _window_catalysts(
        getattr(repo, "list_catalysts", lambda: [])(), end, published_signal_ids
    )
    top_signal = next((item for item in signals if _eligible_for_top_call(item)), None)
    top_call = _top_call(top_signal)
    body = _body(top_call, signals, catalysts, repo)
    return DailyBrief(
        id=f"daily-brief-{end.date().isoformat()}",
        window_start=start,
        window_end=end,
        generated_at=end,
        body=body,
        signal_ids=[item.id for item in signals],
        top_call=top_call,
    )


def _window_signals(signals: Iterable[SignalRecord], start: datetime, end: datetime) -> list[SignalRecord]:
    included = []
    for signal in signals:
        timestamp = signal.published_at
        if timestamp is None or timestamp.tzinfo is None:
            continue
        local_timestamp = timestamp.astimezone(SHANGHAI)
        if start <= local_timestamp < end:
            included.append(signal)
    return sorted(included, key=lambda item: (-item.priority, _timestamp(item), item.id))


def _window_catalysts(catalysts, end: datetime, published_signal_ids: set[str]):
    preview_end = end + timedelta(days=7)
    return sorted(
        (
            item for item in catalysts
            if item.scheduled_at.tzinfo is not None
            and end <= item.scheduled_at.astimezone(SHANGHAI) < preview_end
            and (item.signal_id is None or item.signal_id in published_signal_ids)
        ),
        key=lambda item: (item.scheduled_at, -item.priority, item.id),
    )


def _eligible_for_top_call(signal: SignalRecord) -> bool:
    """Only confirmed, active records may become the decision headline."""
    return signal.validation_status == ValidationStatus.CONFIRMED


def _top_call(signal: SignalRecord | None) -> str:
    return EMPTY_TOP_CALL if signal is None else f"关注 {signal.title} [{signal.id}]"


def _body(top_call: str, signals: list[SignalRecord], catalysts, repo) -> str:
    sections = [f"Top Call\n{top_call}"]
    valid = [item for item in signals if _eligible_for_top_call(item)]
    pending = [item for item in signals if item.validation_status == ValidationStatus.PENDING_OFFICIAL_VALIDATION]
    excluded = [item for item in signals if item not in valid and item not in pending]
    if valid:
        sections.append("\u6838\u5fc3\u4fe1\u53f7\n" + "\n".join(_signal_line(item, repo) for item in valid))
    if pending:
        sections.append("\u5f85\u5b98\u65b9\u9a8c\u8bc1\n" + "\n".join(_signal_line(item, repo) for item in pending))
    if excluded:
        sections.append("\u5df2\u62d2\u7edd\u6216\u5931\u6548\n" + "\n".join(_signal_line(item, repo) for item in excluded))
    if catalysts:
        sections.append("\u672a\u6765\u0037\u65e5\u50ac\u5316\u5242\n" + "\n".join(
            f"- [{item.id}] {item.scheduled_at.astimezone(SHANGHAI).isoformat()} {item.title}" for item in catalysts
        ))
    return "\n\n".join(sections)


def _signal_line(signal: SignalRecord, repo) -> str:
    links = _evidence_links(signal.id, repo)
    link_text = f" ({', '.join(links)})" if links else ""
    return f"- [{signal.id}] {signal.title}: {signal.summary}{link_text}"


def _evidence_links(signal_id: str, repo) -> list[str]:
    list_evidence = getattr(repo, "list_signal_evidence", None)
    get_raw_item = getattr(repo, "get_raw_item", None)
    if not callable(list_evidence) or not callable(get_raw_item):
        return []
    links = []
    for evidence in list_evidence(signal_id):
        raw_item = get_raw_item(evidence.raw_item_id)
        if raw_item is not None and raw_item.url and raw_item.url not in links:
            links.append(raw_item.url)
    return sorted(set(links))


def _timestamp(signal: SignalRecord) -> datetime:
    assert signal.published_at is not None
    return signal.published_at
