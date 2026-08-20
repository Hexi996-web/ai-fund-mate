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
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
OUTPUT = PUBLIC_DIR / "issuance_insights.json"
ACTIVE_FUNDS = PUBLIC_DIR / "funds_active.json"
EXCLUDED_FUNDS = PUBLIC_DIR / "funds_excluded.json"
SHANGHAI = ZoneInfo("Asia/Shanghai")


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
        latest_dates = [item.get("latestScaleDate") for item in shares if item.get("latestScaleDate")]
        current_coverage_complete = len(current_values) == len(shares)
        current_date_consistent = len(latest_dates) == len(shares) and len(set(latest_dates)) == 1
        current_scale = round(sum(current_values), 4) if current_coverage_complete and current_date_consistent else None
        effective_comparable = initial_scale is not None and initial_scale >= 0.5 and current_scale is not None
        growth_amount = round(current_scale - initial_scale, 4) if effective_comparable else None
        growth_rate = round(growth_amount / initial_scale * 100, 2) if effective_comparable else None
        established = date.fromisoformat(representative["establishedDate"])
        age_days = (today - established).days
        active = representative["_active"]
        history_by_date: dict[str, list[float]] = {}
        history_share_count = sum(bool(item.get("scaleHistory")) for item in shares)
        for item in shares:
            for point in item.get("scaleHistory", []):
                history_by_date.setdefault(point["date"], []).append(point["scaleYi"])
        scale_history = [{
            "date": report_date,
            "scaleYi": round(sum(values), 4),
            "shareCoverage": len(values),
            "complete": len(values) == history_share_count,
        } for report_date, values in sorted(history_by_date.items()) if history_share_count and len(values) == history_share_count]
        if initial_scale is not None and not any(point["date"] == representative["establishedDate"] for point in scale_history):
            scale_history.insert(0, {"date": representative["establishedDate"], "scaleYi": initial_scale, "shareCoverage": len(shares), "complete": True, "kind": "launch"})
        history_covered = any(point.get("kind") != "launch" and point["date"] > representative["establishedDate"] for point in scale_history)

        def milestone(days: int) -> dict[str, Any]:
            target = established + timedelta(days=days)
            if today < target:
                return {"status": "upcoming", "targetDate": target.isoformat(), "daysRemaining": (target - today).days}
            candidates = [((date.fromisoformat(point["date"]) - target).days, point) for point in scale_history if point.get("kind") != "launch" and date.fromisoformat(point["date"]) >= target]
            if not candidates:
                return {"status": "pending", "targetDate": target.isoformat()}
            offset, point = min(candidates, key=lambda value: value[0])
            if offset > 60:
                return {"status": "pending", "targetDate": target.isoformat()}
            observed_date = date.fromisoformat(point["date"])
            value = point["scaleYi"]
            return {
                "status": "observed", "targetDate": target.isoformat(), "observationDate": point["date"],
                "observationAgeDays": (observed_date - established).days, "offsetDays": (observed_date - target).days,
                "scaleYi": value, "growthPercent": round((value - initial_scale) / initial_scale * 100, 2) if initial_scale and initial_scale >= 0.5 else None,
            }

        products.append({
            **{key: value for key, value in representative.items() if key != "_active"},
            "productId": product_id,
            "name": active.get("productName") or representative["name"],
            "shareCodes": [item["code"] for item in shares],
            "shareCount": len(shares),
            "initialScaleYi": initial_scale,
            "latestScaleYi": current_scale,
            "latestScaleDate": latest_dates[0] if current_date_consistent else None,
            "scaleGrowthYi": growth_amount,
            "scaleGrowthPercent": growth_rate,
            "scaleGrowthStatus": "基数过小" if initial_scale is not None and initial_scale < 0.5 else "口径不完整" if not current_coverage_complete or not current_date_consistent else "增加" if growth_amount is not None and growth_amount > 0 else "减少" if growth_amount is not None and growth_amount < 0 else "持平" if growth_amount == 0 else "待补全",
            "historyCovered": history_covered,
            "effectiveComparable": effective_comparable,
            "coverageQuadrant": ("有历史" if history_covered else "无历史") + "×" + ("有效可比" if effective_comparable else "不可比"),
            "ageDays": age_days,
            "milestone30": "已满30日" if age_days >= 30 else f"还需{30 - age_days}日",
            "milestone90": "已满90日" if age_days >= 90 else f"还需{90 - age_days}日",
            "d30": milestone(30),
            "d90": milestone(90),
            "scaleHistory": scale_history,
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


def _sector(product: dict[str, Any]) -> str:
    fund_type = product.get("type") or "未知"
    for keyword, label in (("QDII", "海外"), ("FOF", "FOF"), ("指数", "指数"), ("股票", "主动权益"), ("混合", "混合"), ("债券", "固收")):
        if keyword in fund_type:
            return label
    return "其他"


def _product_form(product: dict[str, Any]) -> str:
    text = f'{product.get("name") or ""} {product.get("type") or ""}'.upper()
    if "ETF联接" in text or "ETF 联接" in text:
        return "ETF联接"
    if "FOF" in text:
        return "FOF"
    if "ETF" in text:
        return "ETF"
    if "持有" in text or "滚动" in text:
        return "持有期/滚动持有"
    if "发起" in text:
        return "发起式"
    return "普通开放式"


def _initial_scale_band(product: dict[str, Any]) -> str:
    value = product.get("initialScaleYi")
    if value is None:
        return "未知"
    if value < 0.5:
        return "<0.5亿元"
    if value < 2:
        return "0.5–2亿元"
    if value < 10:
        return "2–10亿元"
    return "≥10亿元"


def summarize_growth_dimensions(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Use the same effectively comparable product universe for every cut."""
    dimensions = [
        ("板块", _sector),
        ("基金公司", lambda item: item.get("manager") or "未知"),
        ("产品形态", _product_form),
        ("首发规模区间", _initial_scale_band),
        ("发行月份", lambda item: str(item.get("establishedDate") or "")[:7] or "未知"),
    ]
    result = []
    comparable = [item for item in products if item.get("effectiveComparable")]
    for dimension, classifier in dimensions:
        groups: dict[str, list[dict[str, Any]]] = {}
        for product in comparable:
            groups.setdefault(classifier(product), []).append(product)
        rows = []
        for label, samples in groups.items():
            ordered = sorted(samples, key=lambda item: (item["scaleGrowthPercent"], item["productId"]))
            rates = [item["scaleGrowthPercent"] for item in ordered]
            middle = len(ordered) // 2
            median_samples = ordered[middle - 1:middle + 1] if len(ordered) % 2 == 0 else ordered[middle:middle + 1]
            rows.append({
                "label": label,
                "sampleCount": len(samples),
                "medianGrowthPercent": round(median(rates), 2),
                "positiveSharePercent": round(sum(rate > 0 for rate in rates) / len(rates) * 100, 1),
                "topFunds": [item["name"] for item in reversed(ordered[-3:])],
                "productIds": [item["productId"] for item in reversed(ordered)],
                "medianProductIds": [item["productId"] for item in median_samples],
            })
        sorted_rows = sorted(rows, key=lambda row: (row["sampleCount"], row["medianGrowthPercent"]), reverse=True)
        meaningful = [row for row in rows if row["sampleCount"] >= 3] or rows
        median_leader = max(meaningful, key=lambda row: row["medianGrowthPercent"], default=None)
        breadth_leader = max(meaningful, key=lambda row: row["positiveSharePercent"], default=None)
        largest = max(rows, key=lambda row: row["sampleCount"], default=None)
        summary = "暂无有效可比样本。" if not rows else (
            f"共覆盖{len(comparable)}个有效可比产品、{len(rows)}个分组。"
            f"{median_leader['label']}的增长中位数最高（{median_leader['medianGrowthPercent']}%）；"
            f"{breadth_leader['label']}的正增长比例最高（{breadth_leader['positiveSharePercent']}%）；"
            f"样本最多的是{largest['label']}（{largest['sampleCount']}个）。"
        )
        result.append({"dimension": dimension, "summary": summary, "groups": sorted_rows})
    return result


def fetch_eastmoney_reported_scales(codes: Iterable[str], workers: int = 12) -> dict[str, dict[str, Any]]:
    """Fetch the reported scale history from Tiantian Fund public pages."""
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
            history = []
            for report_date, point in zip(categories, series):
                value = point.get("y") if isinstance(point, dict) else None
                if value is not None:
                    history.append({"date": str(report_date), "scaleYi": float(value)})
            if not history:
                return code, None
            return code, {
                "latestScaleYi": history[-1]["scaleYi"],
                "latestScaleDate": history[-1]["date"],
                "latestScaleStatus": "天天基金最近一期披露",
                "latestScaleSource": "东方财富/天天基金网公开页面",
                "scaleHistory": history,
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


def _offering_product_name(name: str) -> str:
    return re.sub(r"(?:[\s_-]*(?:A|B|C|D|E|I|R|Y|人民币|美元)(?:类|份额)?)$", "", name, flags=re.IGNORECASE).strip()


def build_future_issuance(ongoing: list[dict[str, Any]], upcoming: list[dict[str, Any]]) -> dict[str, Any]:
    """Collapse share classes and describe the visible forward issuance pipeline."""
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for item in ongoing + upcoming:
        key = (item.get("manager") or "未知", _offering_product_name(item["name"]), item["offeringStartDate"])
        groups.setdefault(key, []).append(item)
    products = []
    for (_, product_name, _), shares in groups.items():
        shares.sort(key=lambda item: item["code"])
        representative = shares[0]
        status = "认购中" if any(item["status"] == "认购中" for item in shares) else "待发行"
        products.append({
            **representative,
            "productId": f"offering:{representative['code']}",
            "name": product_name,
            "status": status,
            "shareCodes": [item["code"] for item in shares],
            "shareCount": len(shares),
            "offeringEndDate": max((item.get("offeringEndDate") or "" for item in shares), default="") or None,
        })
    products.sort(key=lambda item: (item["offeringStartDate"], item["code"]))
    dimensions = [
        ("板块", _sector),
        ("基金公司", lambda item: item.get("manager") or "未知"),
        ("产品形态", _product_form),
        ("发行月份", lambda item: item["offeringStartDate"][:7]),
    ]
    analyses = []
    for dimension, classifier in dimensions:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for product in products:
            grouped.setdefault(classifier(product), []).append(product)
        rows = [{
            "label": label,
            "productCount": len(samples),
            "ongoingCount": sum(item["status"] == "认购中" for item in samples),
            "upcomingCount": sum(item["status"] == "待发行" for item in samples),
            "pipelineSharePercent": round(len(samples) / len(products) * 100, 1) if products else 0,
            "topProducts": [item["name"] for item in samples[:3]],
        } for label, samples in grouped.items()]
        rows.sort(key=lambda row: (row["productCount"], row["label"]), reverse=True)
        leader = rows[0] if rows else None
        summary = "暂无未来发行样本。" if not leader else f"{dimension}共{len(rows)}组；{leader['label']}以{leader['productCount']}只产品居首，占未来发行管线{leader['pipelineSharePercent']}%。"
        analyses.append({"dimension": dimension, "summary": summary, "groups": rows})
    ongoing_count = sum(item["status"] == "认购中" for item in products)
    upcoming_count = sum(item["status"] == "待发行" for item in products)
    return {
        "products": products,
        "ongoingCount": ongoing_count,
        "upcomingCount": upcoming_count,
        "totalCount": len(products),
        "shareClassCount": len(ongoing) + len(upcoming),
        "summary": f"未来发行管线共{len(products)}只产品：{ongoing_count}只认购中、{upcoming_count}只待发行；原始披露包含{len(ongoing) + len(upcoming)}个份额。",
        "dimensionAnalysis": analyses,
    }


def summarize_exclusion_risk(risk_payload: dict[str, Any], today: date) -> dict[str, Any]:
    """Keep the legacy quarantine baseline separate from observed YTD events."""
    funds = risk_payload.get("funds", [])
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for fund in funds:
        groups.setdefault((_offering_product_name(str(fund.get("name") or fund.get("code"))), str(fund.get("operationStatus") or "suspected_terminated")), []).append(fund)
    ytd_start = date(today.year, 1, 1)
    observed = []
    baseline = []
    for samples in groups.values():
        first_observed = _date(samples[0], "firstObservedAt")
        (observed if first_observed and ytd_start <= first_observed <= today else baseline).append(samples)
    return {
        "trackingStartDate": "2026-08-18",
        "ytdConfirmedTerminated": sum(samples[0].get("operationStatus") == "terminated" for samples in observed),
        "ytdSuspectedTerminated": sum(samples[0].get("operationStatus") == "suspected_terminated" for samples in observed),
        "ytdAbnormalProducts": len(observed),
        "baselineProducts": len(baseline),
        "baselineShareClasses": sum(len(samples) for samples in baseline),
        "scope": "仅统计今年以来首次进入异常隔离名单的产品；跟踪前存量只作为基线，不计作今年清盘。确认终止与疑似长期停更分列。",
    }


def current_suspensions(active_payload: dict[str, Any]) -> list[dict[str, Any]]:
    shares_by_product: dict[str, list[dict[str, Any]]] = {}
    for fund in active_payload.get("funds", []):
        product_id = str(fund.get("productId") or fund.get("code"))
        shares_by_product.setdefault(product_id, []).append(fund)
    products: dict[str, dict[str, Any]] = {}
    for product_id, shares in shares_by_product.items():
        paused = [fund for fund in shares if "暂停" in str(fund.get("purchaseStatus") or "")]
        if not paused:
            continue
        paused.sort(key=lambda fund: _code(fund.get("code")) or "")
        fund = paused[0]
        status = str(fund.get("purchaseStatus") or "")
        scale_values = [share.get("scaleYi") for share in shares if share.get("scaleYi") is not None]
        complete_scale = len(scale_values) == len(shares)
        nav_dates = [share.get("lastNetValueDate") for share in shares if share.get("lastNetValueDate")]
        candidate = {
            "productId": product_id,
            "productName": fund.get("productName") or fund.get("name"),
            "representativeCode": _code(fund.get("code")),
            "type": fund.get("type") or "未知",
            "purchaseStatus": status,
            "netValue": fund.get("netValue"),
            "dailyChangePercent": fund.get("dailyChangePercent"),
            "shareCount": len(shares),
            "scaleYi": round(sum(scale_values), 4) if complete_scale else None,
            "scaleCoverageComplete": complete_scale,
            "lastNetValueDate": max(nav_dates) if nav_dates else None,
            "dataSource": "AKShare/东方财富申购状态",
        }
        products[product_id] = candidate
    return sorted(products.values(), key=lambda item: (item["type"], item["representativeCode"] or ""))


def summarize_suspensions(products: list[dict[str, Any]], today: date) -> dict[str, Any]:
    def scale_band(item: dict[str, Any]) -> str:
        value = item.get("scaleYi")
        if value is None:
            return "规模待补全"
        if value < 1:
            return "<1亿元"
        if value < 10:
            return "1–10亿元"
        if value < 50:
            return "10–50亿元"
        return "≥50亿元"

    def nav_freshness(item: dict[str, Any]) -> str:
        nav_date = _date(item, "lastNetValueDate")
        if not nav_date:
            return "净值日期待补全"
        age = (today - nav_date).days
        return "7日内" if age <= 7 else "8–30日" if age <= 30 else ">30日"

    dimensions = [
        ("板块", _sector),
        ("产品形态", _product_form),
        ("规模区间", scale_band),
        ("净值新鲜度", nav_freshness),
    ]
    analyses = []
    for dimension, classifier in dimensions:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for product in products:
            grouped.setdefault(classifier(product), []).append(product)
        rows = [{
            "label": label,
            "productCount": len(samples),
            "sharePercent": round(len(samples) / len(products) * 100, 1) if products else 0,
            "examples": [item["productName"] for item in samples[:3]],
        } for label, samples in grouped.items()]
        rows.sort(key=lambda row: (row["productCount"], row["label"]), reverse=True)
        leader = rows[0] if rows else None
        summary = "暂无暂停申购产品。" if not leader else f"{dimension}共{len(rows)}组；{leader['label']}有{leader['productCount']}只，占暂停申购产品{leader['sharePercent']}%。"
        analyses.append({"dimension": dimension, "summary": summary, "groups": rows})
    return {
        "totalCount": len(products),
        "dimensionAnalysis": analyses,
        "scope": "当前公开快照仅提供暂停申购状态，未提供公告原因；以下为产品结构分析，不将板块或规模特征解释为暂停原因。",
    }


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
    risk_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    today = now.date()
    established = normalize_established(established_rows)
    scale_by_code = normalize_scales(scale_rows)
    reported_scales = reported_scales or {}
    market_by_code = normalize_market_metrics(market_rows)
    established = [{**item, **market_by_code.get(item["code"], {}), **scale_by_code.get(item["code"], {}), **reported_scales.get(item["code"], {})} for item in established]
    recent_established = [item for item in established if date.fromisoformat(item["establishedDate"]) >= date(today.year, 1, 1)]
    growth_products = build_scale_growth_products(recent_established, active_payload, today)
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
    future_issuance = build_future_issuance(ongoing, upcoming)
    return {
        "schemaVersion": 1,
        "generatedAt": now.astimezone(timezone.utc).isoformat(),
        "dataDate": today.isoformat(),
        "sourceStatus": "ready",
        "summary": {
            "todayOffering": len(ongoing),
            "upcomingOffering": len(upcoming),
            "todayEstablished": window_counts["today"],
            "weekEstablished": window_counts["week"],
            "quarterEstablished": window_counts["quarter"],
            "ytdEstablished": window_counts["ytd"],
            "currentSuspended": len(suspensions),
        },
        "offerings": {"ongoing": ongoing, "upcoming": upcoming},
        "futureIssuance": future_issuance,
        "exitRisk": summarize_exclusion_risk(risk_payload or {}, today),
        "rankings": rankings,
        "suspensions": suspensions,
        "suspensionAnalysis": summarize_suspensions(suspensions, today),
        "scaleGrowth": {
            "products": growth_products,
            "increasedCount": sum(item["scaleGrowthStatus"] == "增加" for item in growth_products),
            "comparableCount": sum(item["effectiveComparable"] for item in growth_products),
            "quadrants": [{
                "key": key,
                "count": sum(item["coverageQuadrant"] == key for item in growth_products),
            } for key in ("有历史×有效可比", "有历史×不可比", "无历史×有效可比", "无历史×不可比")],
            "patterns": summarize_growth_patterns(growth_products),
            "dimensionAnalysis": summarize_growth_dimensions(growth_products),
            "historyStartDate": "2026-08-18",
            "scope": "今年以来成立；A/C等份额合并为产品；仅份额覆盖完整、同一披露日且首发规模不低于0.5亿元的产品参与比较",
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


def _optional_records(callable_, label: str, *args, **kwargs) -> list[dict[str, Any]]:
    """Keep an optional enrichment source from aborting the daily snapshot."""
    if callable_ is None:
        print(f"{label}: 接口不可用，跳过可选补充")
        return []
    try:
        return _records(callable_, *args, **kwargs)
    except Exception as error:  # third-party adapters raise multiple parser/network exception types
        print(f"{label}: 获取失败，已降级跳过（{type(error).__name__}: {error}）")
        return []


def main() -> None:
    import akshare as ak

    active_payload = json.loads(ACTIVE_FUNDS.read_text(encoding="utf-8"))
    risk_payload = json.loads(EXCLUDED_FUNDS.read_text(encoding="utf-8")) if EXCLUDED_FUNDS.exists() else {}
    established = _records(ak.fund_new_found_em)
    offering_callable = getattr(ak, "fund_new_found_ths", None)
    offerings = _records(offering_callable, symbol="全部") if offering_callable else []
    scale_callable = getattr(ak, "fund_scale_open_sina", None)
    scales = _optional_records(scale_callable, "新浪基金规模")
    now = datetime.now(SHANGHAI)
    current_year = str(now.year)
    scale_codes = [_code(row.get("基金代码")) for row in established if str(row.get("成立日期", "")).startswith(current_year)]
    reported_scales = fetch_eastmoney_reported_scales(code for code in scale_codes if code)
    market_rows = _records(ak.fund_open_fund_rank_em, symbol="全部")
    payload = build_payload(established, offerings, active_payload, now, scales, reported_scales, market_rows, risk_payload)
    if not payload["rankings"]["ytd"] and not payload["offerings"]["ongoing"]:
        raise RuntimeError("新发基金数据为空，停止覆盖现有发行洞察快照")
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    json.loads(temporary.read_text(encoding="utf-8"))
    temporary.replace(OUTPUT)


if __name__ == "__main__":
    main()
