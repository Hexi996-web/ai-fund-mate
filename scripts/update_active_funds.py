from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fund_product_model import build_products

STALE_DAYS = 60
TERMINATED_WORDS = ("终止", "清算", "已清盘", "终止上市")
ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
REPORT_DATE_FIELDS = (
    "最新净值/万份收益-报告时间",
    "报告时间",
    "净值日期",
    "数据日期",
    "最新-交易日",
    "查询日期",
)
DAILY_VALUE_FIELD_WORDS = ("单位净值", "累计净值", "万份收益", "日增长率", "日涨幅")
DYNAMIC_DATE_PATTERN = re.compile(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)")
SHANGHAI = ZoneInfo("Asia/Shanghai")


def shanghai_today() -> date:
    return datetime.now(SHANGHAI).date()


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

    cutoff = shanghai_today() - timedelta(days=stale_days)
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


def enrich_daily_scale(funds, scale_rows, snapshot_date=None):
    """Attach a dated share-class estimate: latest public shares x unit NAV."""
    snapshot_date = snapshot_date or shanghai_today()
    shares_by_code = {}
    for row in scale_rows:
        code = normalize_code(row.get("基金代码"))
        total_shares = safe_float(row.get("最近总份额"))
        direct_scale_yi = safe_float(row.get("直接估算规模亿元"))
        shares_date = parse_date(row.get("更新日期"))
        established_date = parse_date(row.get("成立日期"))
        raised_scale_wan = safe_float(row.get("总募集规模"))
        if not code or (total_shares is None and direct_scale_yi is None):
            continue
        shares_by_code[code] = (
            total_shares,
            shares_date,
            established_date,
            round(raised_scale_wan / 10_000, 4) if raised_scale_wan is not None else None,
            direct_scale_yi,
            row.get("规模估算口径") or "份额×净值估算",
        )

    enriched = []
    for fund in funds:
        total_shares, shares_date, established_date, initial_scale_yi, direct_scale_yi, scale_method = shares_by_code.get(
            fund["code"], (None, None, None, None, None, "份额×净值估算")
        )
        unit_nav = safe_float(fund.get("netValue"))
        nav_date = parse_date(fund.get("lastNetValueDate")) or snapshot_date
        if direct_scale_yi is None and (total_shares is None or unit_nav is None):
            enriched.append({
                **fund,
                **missing_scale_fields(),
                "establishedDate": established_date.isoformat() if established_date else None,
                "initialScaleYi": initial_scale_yi,
            })
            continue
        staleness = max(0, (nav_date - shares_date).days) if shares_date else None
        grade = "A" if staleness == 0 else "B" if staleness is not None and staleness <= 31 else "C" if staleness is not None else "U"
        enriched.append({**fund, **{
            "scaleYi": round(direct_scale_yi, 4) if direct_scale_yi is not None else round(total_shares * unit_nav / 100_000_000, 4),
            "totalSharesYi": round(total_shares / 100_000_000, 4) if total_shares is not None else None,
            "scaleDate": nav_date.isoformat(),
            "sharesDate": shares_date.isoformat() if shares_date else None,
            "scaleStatus": scale_method,
            "scaleQuality": grade,
            "scaleStalenessDays": staleness,
            "scaleSource": "AKShare/东方财富ETF实时行情" if direct_scale_yi is not None else "AKShare/新浪公开基金规模快照",
            "establishedDate": established_date.isoformat() if established_date else None,
            "initialScaleYi": initial_scale_yi,
        }})
    return enriched


def missing_scale_fields():
    return {"scaleYi": None, "totalSharesYi": None, "scaleDate": None, "sharesDate": None, "scaleStatus": "待披露", "scaleQuality": "U", "scaleStalenessDays": None, "scaleSource": None}


def _product_scale(product):
    values = [safe_float(share.get("scaleYi")) for share in product.get("shares", [])]
    usable = [value for value in values if value is not None]
    return round(sum(usable), 4) if usable else None


def _representative_share(product):
    code = product.get("representativeCode")
    return next((share for share in product.get("shares", []) if share.get("code") == code), {})


def enrich_product_metrics(products, previous_products, snapshot_date=None):
    """Maintain product metrics incrementally without refetching every NAV history daily.

    Existing state is carried forward only for the same product id. Missing historical
    coverage is explicit so a partial first run is never presented as full-year data.
    """
    snapshot_date = snapshot_date or shanghai_today()
    previous_by_id = {item.get("productId"): item for item in previous_products or []}
    for product in products:
        previous = previous_by_id.get(product.get("productId"), {})
        share = _representative_share(product)
        current_nav = safe_float(share.get("netValue"))
        current_scale = _product_scale(product)
        nav_date = parse_date(share.get("lastNetValueDate")) or snapshot_date
        established_dates = [
            parse_date(item.get("establishedDate")) for item in product.get("shares", [])
        ]
        established_dates = [value for value in established_dates if value]
        established_date = min(established_dates) if established_dates else parse_date(previous.get("establishedDate"))
        initial_scales = [
            safe_float(item.get("initialScaleYi")) for item in product.get("shares", [])
        ]
        initial_scales = [value for value in initial_scales if value is not None]
        initial_scale = round(sum(initial_scales), 4) if initial_scales else safe_float(previous.get("initialScaleYi"))

        coverage_start = parse_date(previous.get("metricsCoverageStart")) or nav_date
        previous_year = parse_date(previous.get("metricsAsOf"))
        same_year = previous_year is not None and previous_year.year == snapshot_date.year

        if same_year:
            ytd_start_nav = safe_float(previous.get("ytdStartNav"))
            baseline_nav_date = parse_date(previous.get("baselineNavDate")) or coverage_start
            baseline_nav_type = previous.get("baselineNavType") or (
                "成立" if established_date and established_date.year == snapshot_date.year else "年初"
            )
            peak_nav = safe_float(previous.get("ytdPeakNav"))
            max_drawdown = safe_float(previous.get("maxDrawdownPercent"))
            drawdown_start = previous.get("drawdownStartDate")
            drawdown_end = previous.get("drawdownEndDate")
        else:
            ytd_start_nav = safe_float(previous.get("representativeNav")) or current_nav
            baseline_nav_date = nav_date
            baseline_nav_type = "成立" if established_date and established_date.year == snapshot_date.year else "年初"
            peak_nav = current_nav
            max_drawdown = 0.0 if current_nav is not None else None
            drawdown_start = nav_date.isoformat() if current_nav is not None else None
            drawdown_end = nav_date.isoformat() if current_nav is not None else None

        if current_nav is not None:
            if peak_nav is None or current_nav > peak_nav:
                peak_nav = current_nav
                drawdown_start = nav_date.isoformat()
            current_drawdown = ((current_nav / peak_nav) - 1) * 100 if peak_nav else None
            if current_drawdown is not None and (max_drawdown is None or current_drawdown < max_drawdown):
                max_drawdown = current_drawdown
                drawdown_end = nav_date.isoformat()

        if established_date and established_date.year == snapshot_date.year and initial_scale is not None:
            baseline_scale = initial_scale
            baseline_date = established_date
            baseline_type = "成立规模"
        elif same_year and safe_float(previous.get("baselineScaleYi")) is not None:
            baseline_scale = safe_float(previous.get("baselineScaleYi"))
            baseline_date = parse_date(previous.get("baselineScaleDate"))
            baseline_type = previous.get("baselineScaleType") or "去年年末规模"
        elif previous and previous_year and previous_year.year < snapshot_date.year:
            baseline_scale = safe_float(previous.get("currentScaleYi"))
            baseline_date = previous_year
            baseline_type = "去年年末规模"
        else:
            baseline_scale = None
            baseline_date = None
            baseline_type = "待补充去年年末规模"

        scale_increase = (
            round(current_scale - baseline_scale, 4)
            if current_scale is not None and baseline_scale is not None else None
        )
        scale_growth = (
            round(scale_increase / baseline_scale * 100, 4)
            if scale_increase is not None and baseline_scale not in (None, 0) else None
        )
        nav_growth = (
            round((current_nav / ytd_start_nav - 1) * 100, 4)
            if current_nav is not None and ytd_start_nav not in (None, 0) else None
        )
        product.update({
            "establishedDate": established_date.isoformat() if established_date else None,
            "initialScaleYi": initial_scale,
            "currentScaleYi": current_scale,
            "baselineScaleYi": baseline_scale,
            "baselineScaleDate": baseline_date.isoformat() if baseline_date else None,
            "baselineScaleType": baseline_type,
            "scaleNetIncreaseYi": scale_increase,
            "scaleGrowthPercent": scale_growth,
            "representativeNav": current_nav,
            "ytdStartNav": ytd_start_nav,
            "baselineNavDate": baseline_nav_date.isoformat() if baseline_nav_date else None,
            "baselineNavType": baseline_nav_type,
            "navGrowthPercent": nav_growth,
            "ytdPeakNav": peak_nav,
            "maxDrawdownPercent": round(max_drawdown, 4) if max_drawdown is not None else None,
            "drawdownStartDate": drawdown_start,
            "drawdownEndDate": drawdown_end,
            "metricsCoverageStart": coverage_start.isoformat() if coverage_start else None,
            "metricsAsOf": snapshot_date.isoformat(),
            "metricsCoverage": "全年" if coverage_start and coverage_start <= date(snapshot_date.year, 1, 7) else "接入后累计",
        })
    return products


def build_output_payloads(active_funds, excluded_funds, update_time, previous_products=None):
    products, audit = build_products(active_funds)
    products = enrich_product_metrics(products, previous_products or [])
    enhanced_shares = [share for product in products for share in product["shares"]]
    enhanced_shares.sort(key=lambda share: share["code"])
    return {
        "funds_active.json": {
            "updateTime": update_time,
            "staleThresholdDays": STALE_DAYS,
            "total": len(enhanced_shares),
            "funds": enhanced_shares,
        },
        "funds_excluded.json": {
            "updateTime": update_time,
            "total": len(excluded_funds),
            "funds": excluded_funds,
        },
        "fund_products.json": {
            "updateTime": update_time,
            "productTotal": len(products),
            "shareTotal": len(enhanced_shares),
            "groupingVersion": "v1",
            "products": products,
        },
        "funds_grouping_review.json": {"updateTime": update_time, **audit},
    }


def write_output_payloads(payloads):
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    temporary = []
    try:
        for filename, payload in payloads.items():
            target = PUBLIC_DIR / filename
            temp = target.with_suffix(target.suffix + ".tmp")
            with temp.open("w", encoding="utf-8") as file:
                json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))
            json.loads(temp.read_text(encoding="utf-8"))
            temporary.append((temp, target))
        for temp, target in temporary:
            temp.replace(target)
    finally:
        for temp, _ in temporary:
            if temp.exists():
                temp.unlink()
def main() -> None:
    import akshare as ak

    base = safe_records(ak.fund_name_em, "基金全集")
    previous_excluded_path = PUBLIC_DIR / "funds_excluded.json"
    previous_excluded = json.loads(previous_excluded_path.read_text(encoding="utf-8")) if previous_excluded_path.exists() else {"funds": []}
    previous_excluded_by_code = {fund["code"]: fund for fund in previous_excluded.get("funds", [])}
    previous_products_path = PUBLIC_DIR / "fund_products.json"
    previous_products_payload = json.loads(previous_products_path.read_text(encoding="utf-8")) if previous_products_path.exists() else {"products": []}
    purchase = safe_records(ak.fund_purchase_em, "申购状态")
    open_daily = safe_records(ak.fund_open_fund_daily_em, "开放式基金快照")
    money_daily = safe_records(ak.fund_money_fund_daily_em, "货币基金快照")
    etf_nav_callable = getattr(ak, "fund_etf_spot_ths", None)
    etf_daily = safe_records(etf_nav_callable, "ETF净值快照") if etf_nav_callable else []
    etf_spot_callable = getattr(ak, "fund_etf_spot_em", None)
    etf_spot = safe_records(etf_spot_callable, "ETF行情与份额快照") if etf_spot_callable else []
    if (etf_nav_callable or etf_spot_callable) and not etf_daily and not etf_spot:
        raise RuntimeError("ETF数据源均为空，停止发布，避免将场内ETF误判为终止产品")
    scale_callable = getattr(ak, "fund_scale_open_sina", None)
    scale_rows = []
    if scale_callable:
        for category in ("股票型基金", "混合型基金", "债券型基金", "货币型基金", "QDII基金"):
            scale_rows.extend(safe_records(lambda category=category: scale_callable(symbol=category), f"{category}规模快照"))
    for row in etf_spot:
        total_market_value = safe_float(row.get("总市值"))
        scale_rows.append({
            "基金代码": row.get("代码"),
            "最近总份额": safe_float(row.get("最新份额")),
            "更新日期": row.get("数据日期"),
            "直接估算规模亿元": round(total_market_value / 100_000_000, 4) if total_market_value is not None else None,
            "规模估算口径": "ETF总市值估算",
        })

    if not base:
        raise RuntimeError("基金全集为空，停止覆盖现有文件")
    if not purchase and not open_daily and not money_daily and not etf_daily and not etf_spot:
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
    etf_by_code = {
        normalize_code(row.get("基金代码")): row
        for row in etf_daily if row.get("基金代码") is not None
    }
    etf_spot_by_code = {
        normalize_code(row.get("代码")): row
        for row in etf_spot if row.get("代码") is not None
    }
    active_codes = set(open_by_code) | set(money_by_code) | set(etf_by_code) | set(etf_spot_by_code)

    active_funds = []
    excluded_funds = []
    for row in base:
        code = normalize_code(row.get("基金代码"))
        name = str(row.get("基金简称", "")).strip()
        if not code or not name:
            continue

        purchase_row = purchase_by_code.get(code, {})
        open_row = open_by_code.get(code, {})
        etf_row = etf_by_code.get(code, {})
        spot_row = etf_spot_by_code.get(code, {})
        daily_row = open_row or money_by_code.get(code, {}) or etf_row or spot_row
        purchase_status = first_value(purchase_row, ("申购状态",)) or first_value(etf_row, ("申购状态",))
        redemption_status = first_value(purchase_row, ("赎回状态",)) or first_value(etf_row, ("赎回状态",))
        last_date = extract_last_net_value_date(daily_row, purchase_row)
        operation_status, reason = classify_fund(
            name=name,
            purchase_status=str(purchase_status) if purchase_status else None,
            redemption_status=str(redemption_status) if redemption_status else None,
            last_net_value_date=last_date,
            appears_active=code in active_codes,
        )

        if operation_status in ("terminated", "suspected_terminated"):
            previous = previous_excluded_by_code.get(code)
            first_observed_at = previous.get("firstObservedAt") if previous else shanghai_today().isoformat()
            if previous and previous.get("operationStatus") != operation_status:
                first_observed_at = shanghai_today().isoformat()
            excluded_funds.append({
                "code": code,
                "name": name,
                "operationStatus": operation_status,
                "lastNetValueDate": last_date.isoformat() if last_date else None,
                "exclusionReason": reason,
                "firstObservedAt": first_observed_at,
            })
            continue

        active_funds.append({
            "code": code,
            "name": name,
            "type": str(row.get("基金类型", "未知")).strip() or "未知",
            "netValue": safe_float(
                first_value(open_row, ("单位净值", "最新单位净值"))
                or first_value(purchase_row, ("最新净值/万份收益",))
                or first_value(etf_row, ("当前-单位净值", "最新-单位净值"))
                or first_value(spot_row, ("IOPV实时估值", "最新价"))
            ),
            "dailyChangePercent": safe_float(
                first_value(open_row, ("日增长率", "日涨幅", "日增长值"))
                or first_value(etf_row, ("增长率",))
                or first_value(spot_row, ("涨跌幅",))
            ),
            "lastNetValueDate": last_date.isoformat() if last_date else None,
            "purchaseStatus": purchase_status,
            "redemptionStatus": redemption_status,
            "operationStatus": operation_status,
        })

    active_funds = enrich_daily_scale(active_funds, scale_rows)
    now = datetime.now(SHANGHAI).strftime("%Y-%m-%d %H:%M:%S")
    payloads = build_output_payloads(
        active_funds,
        excluded_funds,
        now,
        previous_products_payload.get("products", []),
    )
    write_output_payloads(payloads)
    print(
        f"活跃基金份额：{payloads['fund_products.json']['shareTotal']}；"
        f"基金产品：{payloads['fund_products.json']['productTotal']}；"
        f"隔离基金：{len(excluded_funds)}"
    )

if __name__ == "__main__":
    main()
