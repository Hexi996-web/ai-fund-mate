from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

STALE_DAYS = 60
TERMINATED_WORDS = ("终止", "清算", "已清盘", "终止上市")
ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
REPORT_DATE_FIELDS = (
    "最新净值/万份收益-报告时间",
    "报告时间",
    "净值日期",
    "数据日期",
)
DAILY_VALUE_FIELD_WORDS = ("单位净值", "累计净值", "万份收益", "日增长率", "日涨幅")
DYNAMIC_DATE_PATTERN = re.compile(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)")


def normalize_code(value: Any) -> str:
    return str(value).strip().zfill(6)


def safe_float(value: Any) -> float | None:
    try:
        if value is None or str(value).strip() in ("", "---", "nan"):
            return None
        return float(str(value).replace("%", "").replace(",", ""))
    except (TypeError, ValueError):
        return None


def parse_date(value: Any) -> date | None:
    if value is None or str(value).strip() in ("", "nan", "NaT"):
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def is_meaningful_value(value: Any) -> bool:
    return value is not None and str(value).strip() not in ("", "nan", "---")


def first_value(record: dict[str, Any], names: tuple[str, ...]) -> Any:
    for name in names:
        value = record.get(name)
        if is_meaningful_value(value):
            return value
    return None


def extract_last_net_value_date(
        daily_row: dict[str, Any], purchase_row: dict[str, Any]) -> date | None:
    explicit_daily_date = parse_date(first_value(daily_row, REPORT_DATE_FIELDS))
    if explicit_daily_date:
        return explicit_daily_date

    for field_name in daily_row:
        field_text = str(field_name)
        if (
            not any(word in field_text for word in DAILY_VALUE_FIELD_WORDS)
            or not is_meaningful_value(daily_row[field_name])
        ):
            continue
        match = DYNAMIC_DATE_PATTERN.search(field_text)
        if match:
            dynamic_date = parse_date(match.group(1))
            if dynamic_date:
                return dynamic_date

    return parse_date(first_value(purchase_row, REPORT_DATE_FIELDS))


def classify_fund(*, name, purchase_status, redemption_status,
                  last_net_value_date, appears_active, stale_days=STALE_DAYS):
    status_text = " ".join(
        value for value in (name, purchase_status, redemption_status) if value
    )
    if any(word in status_text for word in TERMINATED_WORDS):
        return "terminated", "状态明确包含终止、清算或清盘信息"

    cutoff = date.today() - timedelta(days=stale_days)
    if last_net_value_date and last_net_value_date >= cutoff:
        return "active", None
    if appears_active:
        return "active_snapshot", None
    return (
        "suspected_terminated",
        f"超过{stale_days}天无净值，且未出现在当日活跃基金列表",
    )


def safe_records(fetcher, label: str) -> list[dict[str, Any]]:
    try:
        frame = fetcher()
        print(f"{label}: {len(frame)} 条")
        return frame.to_dict("records")
    except Exception as error:
        print(f"警告：{label}获取失败：{error}")
        return []


def main() -> None:
    import akshare as ak

    base = safe_records(ak.fund_name_em, "基金全集")
    purchase = safe_records(ak.fund_purchase_em, "申购状态")
    open_daily = safe_records(ak.fund_open_fund_daily_em, "开放式基金快照")
    money_daily = safe_records(ak.fund_money_fund_daily_em, "货币基金快照")

    if not base:
        raise RuntimeError("基金全集为空，停止覆盖现有文件")
    if not purchase and not open_daily and not money_daily:
        raise RuntimeError("所有活跃状态数据源均不可用，停止覆盖现有文件")

    purchase_by_code = {
        normalize_code(row.get("基金代码")): row
        for row in purchase if row.get("基金代码") is not None
    }
    open_by_code = {
        normalize_code(row.get("基金代码")): row
        for row in open_daily if row.get("基金代码") is not None
    }
    money_by_code = {
        normalize_code(row.get("基金代码")): row
        for row in money_daily if row.get("基金代码") is not None
    }
    active_codes = set(open_by_code) | set(money_by_code)

    active_funds = []
    excluded_funds = []
    for row in base:
        code = normalize_code(row.get("基金代码"))
        name = str(row.get("基金简称", "")).strip()
        if not code or not name:
            continue

        purchase_row = purchase_by_code.get(code, {})
        open_row = open_by_code.get(code, {})
        daily_row = open_row or money_by_code.get(code, {})
        purchase_status = first_value(purchase_row, ("申购状态",))
        redemption_status = first_value(purchase_row, ("赎回状态",))
        last_date = extract_last_net_value_date(daily_row, purchase_row)
        operation_status, reason = classify_fund(
            name=name,
            purchase_status=str(purchase_status) if purchase_status else None,
            redemption_status=str(redemption_status) if redemption_status else None,
            last_net_value_date=last_date,
            appears_active=code in active_codes,
        )

        if operation_status in ("terminated", "suspected_terminated"):
            excluded_funds.append({
                "code": code,
                "name": name,
                "operationStatus": operation_status,
                "lastNetValueDate": last_date.isoformat() if last_date else None,
                "exclusionReason": reason,
            })
            continue

        active_funds.append({
            "code": code,
            "name": name,
            "type": str(row.get("基金类型", "未知")).strip() or "未知",
            "netValue": safe_float(
                first_value(open_row, ("单位净值", "最新单位净值"))
                or first_value(purchase_row, ("最新净值/万份收益",))
            ),
            "dailyChangePercent": safe_float(
                first_value(open_row, ("日增长率", "日涨幅", "日增长值"))
            ),
            "lastNetValueDate": last_date.isoformat() if last_date else None,
            "purchaseStatus": purchase_status,
            "redemptionStatus": redemption_status,
            "operationStatus": operation_status,
        })

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    outputs = (
        ("funds_active.json", {
            "updateTime": now,
            "staleThresholdDays": STALE_DAYS,
            "total": len(active_funds),
            "funds": active_funds,
        }),
        ("funds_excluded.json", {
            "updateTime": now,
            "total": len(excluded_funds),
            "funds": excluded_funds,
        }),
    )
    for filename, payload in outputs:
        with (PUBLIC_DIR / filename).open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))

    print(f"活跃基金：{len(active_funds)}；隔离基金：{len(excluded_funds)}")


if __name__ == "__main__":
    main()
