"""Build the free-data MVP snapshot for the fund issuance insight workspace."""

from __future__ import annotations

import json
import re
from statistics import median
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.request import Request, urlopen


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


def normalize_scales(rows: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Index Sina's free open-fund scale snapshot by share-class code.

    Current scale is estimated as latest total shares times unit NAV.  The
    upstream total fundraising field is deliberately not used because it is
    an initial issuance measure rather than current AUM.
    """
    scales: dict[str, dict[str, Any]] = {}
    for row in rows:
        code = _code(row.get("基金代码"))
        total_shares = _number(row, "最近总份额")
        unit_nav = _number(row, "单位净值")
        scale_date = _date(row, "更新日期")
        if not code or total_shares is None or unit_nav is None:
            continue
        scales[code] = {
            "latestScaleYi": round(total_shares * unit_nav / 100000000, 4),
            "latestScaleDate": scale_date.isoformat() if scale_date else None,
            "latestScaleStatus": "份额×净值估算",
        }
    return scales


def normalize_market_metrics(rows: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    metrics = {}
    for row in rows:
        code = _code(row.get("基金代码"))
        if not code:
            continue
        metrics[code] = {
            "navDate": _text(row, "日期"),
            "unitNav": _number(row, "单位净值"),
            "dailyReturnPercent": _number(row, "日增长率"),
            "weekReturnPercent": _number(row, "近1周"),
            "monthReturnPercent": _number(row, "近1月"),
            "quarterReturnPercent": _number(row, "近3月"),
            "ytdReturnPercent": _number(row, "今年来"),
        }
    return metrics


def build_scale_growth_products(items: list[dict[str, Any]], active_payload: dict[str, Any], today: date) -> list[dict[str, Any]]:
    """Collapse share classes and compare the current product AUM with its launch baseline."""
    active_by_code = {str(fund.get("code")): fund for fund in active_payload.get("funds", [])}
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        active = active_by_code.get(item["code"], {})
        product_id = str(active.get("productId") or item["code"])
        groups.setdefault(product_id, []).append({**item, "_active": active})

    products = []
    for product_id, shares in groups.items():
        shares.sort(key=lambda item: item["code"])
        representative = shares[0]
        initial_values = [item["raisedSharesYi"] for item in shares if item.get("raisedSharesYi") is not None]
        current_values = [item["latestScaleYi"] for item in shares if item.get("latestScaleYi") is not None]
        initial_scale = max(initial_values) if initial_values else None
        current_scale = round(sum(current_values), 4) if current_values else None
        growth_amount = round(current_scale - initial_scale, 4) if initial_scale is not None and current_scale is not None else None
        growth_rate = round(growth_amount / initial_scale * 100, 2) if growth_amount is not None and initial_scale else None
        established = date.fromisoformat(representative["establishedDate"])
        age_days = (today - established).days
        latest_dates = [item.get("latestScaleDate") for item in shares if item.get("latestScaleDate")]
        active = representative["_active"]
        products.append({
            **{key: value for key, value in representative.items() if key != "_active"},
            "productId": product_id,
            "name": active.get("productName") or representative["name"],
            "shareCodes": [item["code"] for item in shares],
            "shareCount": len(shares),
            "initialScaleYi": initial_scale,
            "latestScaleYi": current_scale,
            "latestScaleDate": max(latest_dates) if latest_dates else None,
            "scaleGrowthYi": growth_amount,
            "scaleGrowthPercent": growth_rate,
            "scaleGrowthStatus": "增加" if growth_amount is not None and growth_amount > 0 else "减少" if growth_amount is not None and growth_amount < 0 else "持平" if growth_amount == 0 else "待补全",
            "ageDays": age_days,
            "milestone30": "已满30日" if age_days >= 30 else f"还需{30 - age_days}日",
            "milestone90": "已满90日" if age_days >= 90 else f"还需{90 - age_days}日",
        })
    return sorted(products, key=lambda item: (item["establishedDate"], item["code"]), reverse=True)


def summarize_growth_patterns(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for product in products:
        if product.get("scaleGrowthPercent") is not None:
            groups.setdefault(product.get("type") or "未知", []).append(product)
    patterns = []
    for fund_type, samples in groups.items():
        rates = [item["scaleGrowthPercent"] for item in samples]
        patterns.append({
            "dimension": fund_type,
            "sampleCount": len(samples),
            "medianGrowthPercent": round(median(rates), 2),
            "positiveSharePercent": round(sum(rate > 0 for rate in rates) / len(rates) * 100, 1),
            "topFunds": [item["name"] for item in sorted(samples, key=lambda item: item["scaleGrowthPercent"], reverse=True)[:3]],
        })
    return sorted(patterns, key=lambda item: (item["sampleCount"], item["medianGrowthPercent"]), reverse=True)


def fetch_eastmoney_reported_scales(codes: Iterable[str], workers: int = 12) -> dict[str, dict[str, Any]]:
    """Fetch the latest directly reported scale from Tiantian Fund public pages."""
    pattern = re.compile(r"Data_fluctuationScale\s*=\s*(\{.*?\});")

    def fetch(code: str) -> tuple[str, dict[str, Any] | None]:
        request = Request(
            f"https://fund.eastmoney.com/pingzhongdata/{code}.js",
            headers={"User-Agent": "Mozilla/5.0 (compatible; AIFundMate/1.0)"},
        )
        try:
            with urlopen(request, timeout=12) as response:
                content = response.read().decode("utf-8", errors="ignore")
            match = pattern.search(content)
            if not match:
                return code, None
            payload = json.loads(match.group(1))
            categories, series = payload.get("categories", []), payload.get("series", [])
            if not categories or not series:
                return code, None
            value = series[-1].get("y") if isinstance(series[-1], dict) else None
            if value is None:
                return code, None
            return code, {
                "latestScaleYi": float(value),
                "latestScaleDate": str(categories[-1]),
                "latestScaleStatus": "天天基金最近一期披露",
                "latestScaleSource": "东方财富/天天基金网公开页面",
            }
        except (OSError, ValueError, json.JSONDecodeError):
            return code, None

    unique_codes = sorted(set(codes))
    results = {}
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(fetch, code) for code in unique_codes]
        for future in as_completed(futures):
            code, scale = future.result()
            if scale:
                results[code] = scale
    return results


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
    scale_rows: Iterable[dict[str, Any]] = (),
    reported_scales: dict[str, dict[str, Any]] | None = None,
    market_rows: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    today = now.date()
    established = normalize_established(established_rows)
    scale_by_code = normalize_scales(scale_rows)
    reported_scales = reported_scales or {}
    market_by_code = normalize_market_metrics(market_rows)
    established = [{**item, **market_by_code.get(item["code"], {}), **scale_by_code.get(item["code"], {}), **reported_scales.get(item["code"], {})} for item in established]
    growth_products = build_scale_growth_products(established, active_payload, today)
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
        rankings[key] = _rank(selected, short_window=key in ("today", "week"))

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
        "scaleGrowth": {
            "products": growth_products,
            "increasedCount": sum(item["scaleGrowthStatus"] == "增加" for item in growth_products),
            "comparableCount": sum(item["scaleGrowthPercent"] is not None for item in growth_products),
            "patterns": summarize_growth_patterns(growth_products),
            "historyStartDate": "2026-08-18",
        },
        "methodology": {
            "shortWindow": "募集规模80%+成立以来收益20%",
            "longWindow": "募集规模55%+成立以来收益45%",
            "warning": "成立不足一个月的收益仅供观察；最新规模为免费公开接口的份额级快照，未披露时显示待补全。",
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
    scale_callable = getattr(ak, "fund_scale_open_sina", None)
    scales = _records(scale_callable) if scale_callable else []
    current_year = str(datetime.now(timezone.utc).year)
    scale_codes = [_code(row.get("基金代码")) for row in established if str(row.get("成立日期", "")).startswith(current_year)]
    reported_scales = fetch_eastmoney_reported_scales(code for code in scale_codes if code)
    market_rows = _records(ak.fund_open_fund_rank_em, symbol="全部")
    payload = build_payload(established, offerings, active_payload, datetime.now(timezone.utc), scales, reported_scales, market_rows)
    if not payload["rankings"]["ytd"] and not payload["offerings"]["ongoing"]:
        raise RuntimeError("新发基金数据为空，停止覆盖现有发行洞察快照")
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    json.loads(temporary.read_text(encoding="utf-8"))
    temporary.replace(OUTPUT)


if __name__ == "__main__":
    main()
