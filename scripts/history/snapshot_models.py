from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation


def parse_date(value, fallback=None):
    if value in (None, ""):
        return fallback
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return fallback


def parse_timestamp(value):
    if value in (None, ""):
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        parsed_date = parse_date(text)
        return datetime.combine(parsed_date, datetime.min.time(), timezone.utc) if parsed_date else None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def decimal_or_none(value):
    if value in (None, "", "--"):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def integer_or_none(value):
    try:
        return int(value) if value not in (None, "", "--") else None
    except (ValueError, TypeError):
        return None


def infer_snapshot_date(name, payload):
    for value in (payload.get("dataDate"), payload.get("snapshotDate"), payload.get("generatedAt"), payload.get("updateTime")):
        parsed = parse_date(value)
        if parsed:
            return parsed
    raise ValueError(f"{name} 缺少可识别的快照日期")


def dataset_row_count(name, payload):
    keys = {"fund_products": "products", "funds_active": "funds", "attention_pool_evidence": "items",
            "pre_research_evidence": "items", "social_attention_history": "snapshots",
            "theme_external_signals": "items", "issuance_insights": "suspensions"}
    value = payload.get(keys.get(name, ""))
    return len(value) if isinstance(value, list) else None


def product_rows(payload, day):
    return [(str(x["productId"]), x["productName"], x.get("type"), parse_date(x.get("establishedDate")),
             day, day, x.get("groupingConfidence"), {}) for x in payload.get("products", [])
            if x.get("productId") and x.get("productName")]


def share_rows(payload, day):
    rows = []
    for x in payload.get("funds", []):
        code, name = str(x.get("code") or "").zfill(6), str(x.get("name") or "").strip()
        if len(code) == 6 and code.isdigit() and name:
            rows.append((code, x.get("productId"), name, x.get("type"), x.get("shareClass"),
                         parse_date(x.get("establishedDate")), day, day,
                         x.get("operationStatus") not in {"terminated", "suspected_terminated"},
                         x.get("groupingConfidence"), x.get("groupingRule"), {}))
    return rows


def share_observation_rows(payload, day, snapshot_id):
    updated = parse_timestamp(payload.get("updateTime")); rows = []
    for x in payload.get("funds", []):
        code = str(x.get("code") or "").zfill(6)
        if len(code) == 6 and code.isdigit():
            rows.append((code, day, decimal_or_none(x.get("netValue")), decimal_or_none(x.get("dailyChangePercent")),
                         decimal_or_none(x.get("scaleYi")), decimal_or_none(x.get("totalSharesYi")),
                         parse_date(x.get("scaleDate")), parse_date(x.get("sharesDate")), x.get("purchaseStatus"),
                         x.get("redemptionStatus"), x.get("operationStatus"), x.get("scaleStatus"),
                         x.get("scaleQuality"), x.get("scaleSource"), updated, snapshot_id, {}))
    return rows


def product_metric_rows(payload, day, snapshot_id):
    updated = parse_timestamp(payload.get("updateTime")); version = str(payload.get("groupingVersion") or "v1")
    rows = []
    for x in payload.get("products", []):
        if x.get("productId"):
            rows.append((str(x["productId"]), day, x.get("representativeCode"), integer_or_none(x.get("shareCount")),
                         decimal_or_none(x.get("currentScaleYi")), decimal_or_none(x.get("baselineScaleYi")),
                         parse_date(x.get("baselineScaleDate")), decimal_or_none(x.get("scaleNetIncreaseYi")),
                         decimal_or_none(x.get("scaleGrowthPercent")), decimal_or_none(x.get("representativeNav")),
                         decimal_or_none(x.get("navGrowthPercent")), decimal_or_none(x.get("maxDrawdownPercent")),
                         parse_date(x.get("drawdownStartDate")), parse_date(x.get("drawdownEndDate")),
                         parse_date(x.get("metricsCoverageStart")), version, updated, snapshot_id, {}))
    return rows


def theme_rows(payload, day):
    return [(str(x["id"]), x.get("name") or x.get("query") or x["id"], x.get("query"), x.get("boardCode"), day, day, {})
            for x in payload.get("items", []) if x.get("id")]


def theme_signal_rows(payload, day, snapshot_id):
    version = str(payload.get("methodologyVersion") or "v1"); updated = parse_timestamp(payload.get("generatedAt"))
    ranks = {key: rank for rank, key in enumerate(payload.get("recommendedIds") or [], 1)}; rows = []
    for x in payload.get("items", []):
        if not x.get("id"): continue
        scores = [decimal_or_none((x.get(key) or {}).get("score")) for key in ("attention", "validation", "capacity")]
        available = [score for score in scores if score is not None]
        rows.append((x["id"], day, version, *scores, sum(available) / len(available) if available else None,
                     ranks.get(x["id"]), (x.get("lifecycle") or {}).get("state"), x, updated, snapshot_id))
    return rows


def attention_daily_rows(payload, snapshot_id):
    updated = parse_timestamp(payload.get("generatedAt")); rows = []
    for item in payload.get("daily", []):
        day = parse_date(item.get("date"))
        for theme_id, values in (item.get("themes") or {}).items():
            rows.append((theme_id, day, integer_or_none(values.get("appearances")), integer_or_none(values.get("resonance")),
                         integer_or_none(values.get("bestRank")), integer_or_none(item.get("samples")), updated, snapshot_id))
    return rows
