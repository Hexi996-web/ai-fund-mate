"""Build the free-data MVP snapshot for the fund issuance insight workspace."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
OUTPUT = PUBLIC_DIR / "issuance_insights.json"
ACTIVE_FUNDS = PUBLIC_DIR / "funds_active.json"


def _text(row: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip() not in ("", "nan", "None"):
            return str(value).strip()
    return None


def _number(row: dict[str, Any], *keys: str) -> float | None:
    value = _text(row, *keys)
    if value is None:
        return None
    try:
        return float(value.replace("%", "").replace(",", ""))
    except ValueError:
        return None


def _date(row: dict[str, Any], *keys: str) -> date | None:
    value = _text(row, *keys)
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value[:10]).date()
    except ValueError:
        return None


def _code(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().split(".", 1)[0]
    return normalized.zfill(6) if normalized.isdigit() else None


def normalize_established(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    funds = []
    seen = set()
    for row in rows:
        code = _code(row.get("基金代码"))
        established = _date(row, "成立日期")
        if not code or not established or code in seen:
            continue
        seen.add(code)
        funds.append({
            "code": code,
            "name": _text(row, "基金简称", "基金名称") or code,
            "manager": _text(row, "发行公司", "管理人"),
            "managerName": _text(row, "基金经理"),
            "type": _text(row, "基金类型", "投资类型") or "未知",
            "establishedDate": established.isoformat(),
            "raisedSharesYi": _number(row, "募集份额", "发行份额"),
            "returnSinceInceptionPercent": _number(row, "成立来涨幅", "成立以来涨幅"),
            "purchaseStatus": _text(row, "申购状态"),
            "latestScaleYi": None,
            "latestScaleStatus": "待定期报告补全",
            "dataSource": "AKShare/东方财富公开数据",
        })
    return funds


def normalize_offerings(rows: Iterable[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    offerings = []
    seen = set()
    for row in rows:
        code = _code(row.get("基金代码"))
        start = _date(row, "募集起始日", "发行日期")
        end = _date(row, "募集终止日", "募集截止日")
        if not code or not start or code in seen:
            continue
        seen.add(code)
        status = "将发行" if start > today else "认购中" if end is None or today <= end else "募集结束"
        offerings.append({
            "code": code,
            "name": _text(row, "基金名称", "基金简称") or code,
            "type": _text(row, "基金类型", "投资类型") or "未知",
            "manager": _text(row, "管理人", "发行公司"),
            "managerName": _text(row, "基金经理"),
            "offeringStartDate": start.isoformat(),
            "offeringEndDate": end.isoformat() if end else None,
            "status": status,
            "subscriptionFeePercent": _number(row, "认购费率"),
            "minimumSubscription": _number(row, "最低认购"),
            "dataSource": "AKShare/同花顺公开数据",
        })
    return offerings


def current_suspensions(active_payload: dict[str, Any]) -> list[dict[str, Any]]:
    products: dict[str, dict[str, Any]] = {}
    for fund in active_payload.get("funds", []):
        status = str(fund.get("purchaseStatus") or "")
        if "暂停" not in status:
            continue
        product_id = str(fund.get("productId") or fund.get("code"))
        candidate = {
            "productId": product_id,
            "productName": fund.get("productName") or fund.get("name"),
            "representativeCode": _code(fund.get("code")),
            "type": fund.get("type") or "未知",
            "purchaseStatus": status,
            "lastNetValueDate": fund.get("lastNetValueDate"),
            "netValue": fund.get("netValue"),
            "dailyChangePercent": fund.get("dailyChangePercent"),
            "dataSource": "AKShare/东方财富申购状态",
        }
        existing = products.get(product_id)
        if existing is None or candidate["representativeCode"] < existing["representativeCode"]:
            products[product_id] = candidate
    return sorted(products.values(), key=lambda item: (item["type"], item["representativeCode"] or ""))


def _rank(items: list[dict[str, Any]], short_window: bool) -> list[dict[str, Any]]:
    scale_values = sorted({item["raisedSharesYi"] for item in items if item["raisedSharesYi"] is not None})
    return_values = sorted({item["returnSinceInceptionPercent"] for item in items if item["returnSinceInceptionPercent"] is not None})

    def percentile(value: float | None, values: list[float]) -> float:
        if value is None or not values:
            return 0.0
        return (values.index(value) + 1) / len(values) * 100

    scale_weight, return_weight = (0.8, 0.2) if short_window else (0.55, 0.45)
    ranked = []
    for item in items:
        score = scale_weight * percentile(item["raisedSharesYi"], scale_values)
        score += return_weight * percentile(item["returnSinceInceptionPercent"], return_values)
        ranked.append({**item, "successScore": round(score, 1)})
    return sorted(
        ranked,
        key=lambda item: (item["successScore"], item["raisedSharesYi"] or -1, item["code"]),
        reverse=True,
    )


def build_payload(
    established_rows: Iterable[dict[str, Any]],
    offering_rows: Iterable[dict[str, Any]],
    active_payload: dict[str, Any],
    now: datetime,
) -> dict[str, Any]:
    today = now.date()
    established = normalize_established(established_rows)
    offerings = normalize_offerings(offering_rows, today)
    windows = {
        "today": today,
        "week": today - timedelta(days=6),
        "quarter": today - timedelta(days=89),
        "ytd": date(today.year, 1, 1),
    }
    rankings = {}
    window_counts = {}
    for key, start in windows.items():
        selected = [item for item in established if start <= date.fromisoformat(item["establishedDate"]) <= today]
        window_counts[key] = len(selected)
        rankings[key] = _rank(selected, short_window=key in ("today", "week"))[:50]

    suspensions = current_suspensions(active_payload)
    ongoing = [item for item in offerings if item["status"] == "认购中"]
    upcoming = [item for item in offerings if item["status"] == "将发行"]
    return {
        "schemaVersion": 1,
        "generatedAt": now.astimezone(timezone.utc).isoformat(),
        "dataDate": today.isoformat(),
        "sourceStatus": "ready",
        "summary": {
            "todayOffering": len(ongoing),
            "todayEstablished": window_counts["today"],
            "weekEstablished": window_counts["week"],
            "quarterEstablished": window_counts["quarter"],
            "ytdEstablished": window_counts["ytd"],
            "currentSuspended": len(suspensions),
        },
        "offerings": {"ongoing": ongoing, "upcoming": upcoming},
        "rankings": rankings,
        "suspensions": suspensions,
        "methodology": {
            "shortWindow": "募集规模80%+成立以来收益20%",
            "longWindow": "募集规模55%+成立以来收益45%",
            "warning": "成立不足一个月的收益仅供观察；最新规模待定期报告或交易所数据补全。",
        },
    }


def _records(callable_, *args, **kwargs) -> list[dict[str, Any]]:
    frame = callable_(*args, **kwargs)
    return frame.where(frame.notna(), None).to_dict(orient="records")


def main() -> None:
    import akshare as ak

    active_payload = json.loads(ACTIVE_FUNDS.read_text(encoding="utf-8"))
    established = _records(ak.fund_new_found_em)
    offering_callable = getattr(ak, "fund_new_found_ths", None)
    offerings = _records(offering_callable, symbol="全部") if offering_callable else []
    payload = build_payload(established, offerings, active_payload, datetime.now(timezone.utc))
    if not payload["rankings"]["ytd"] and not payload["offerings"]["ongoing"]:
        raise RuntimeError("新发基金数据为空，停止覆盖现有发行洞察快照")
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    json.loads(temporary.read_text(encoding="utf-8"))
    temporary.replace(OUTPUT)


if __name__ == "__main__":
    main()
