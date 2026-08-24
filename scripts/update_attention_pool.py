"""Build the public-data snapshot for the social-attention foresight map.

The two axes intentionally use observable proxies:
- social attention: GDELT share of global online coverage, 90-day timeline;
- market validation: Eastmoney concept-board price and turnover trend.

Neither proxy is labelled as enterprise revenue or a customer survey.  Themes
without both series remain in the research universe but receive no coordinates.
"""
from __future__ import annotations

import json
import math
import time
from datetime import datetime
from pathlib import Path
from statistics import fmean

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "attention_pool_evidence.json"
PRE_EVIDENCE = ROOT / "public" / "pre_research_evidence.json"

THEMES = [
    ("ai-agent", "人工智能", "BK0800"),
    ("embodied-ai", "人形机器人", "BK1184"),
    ("space", "商业航天", "BK0963"),
    ("power", "智能电网", "BK1647"),
    ("hard-tech", "半导体设备", "BK0917"),
    ("biotech", "创新药", "BK1106"),
    ("longevity", "养老产业", "BK0653"),
    ("experience", "文旅消费", "BK1652"),
    ("resources", "战略资源", "BK0523"),
    ("future-tech", "量子科技", "BK0710"),
    ("industrial-software", "工业软件", "BK0696"),
    ("ai-application", "人工智能应用", "BK0579"),
]

HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"}


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def get_json(url: str, params: dict, timeout: int = 40) -> dict:
    response = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def gdelt_attention(query: str) -> dict:
    payload = get_json(
        "https://api.gdeltproject.org/api/v2/doc/doc",
        {"query": f'"{query}"', "mode": "timelinevol", "format": "json", "timespan": "3months"},
    )
    timeline = (payload.get("timeline") or [{}])[0].get("data") or []
    values = [float(row.get("value", 0)) for row in timeline if row.get("value") is not None]
    if len(values) < 45:
        raise ValueError(f"GDELT returned only {len(values)} observations")
    recent = fmean(values[-30:])
    prior = fmean(values[-60:-30]) or 1e-9
    rank = sum(value <= recent for value in values) / len(values)
    acceleration = (recent / prior - 1) * 100
    score = clamp(25 + rank * 45 + clamp(acceleration, -50, 100) * 0.20)
    return {
        "score": round(score, 1),
        "recent30Average": round(recent, 6),
        "prior30Average": round(prior, 6),
        "accelerationPercent": round(acceleration, 1),
        "observations": len(values),
        "source": "GDELT DOC 2.0 TimelineVol",
        "sourceUrl": "https://api.gdeltproject.org/api/v2/doc/doc",
        "status": "真实公开代理",
        "note": "全球在线媒体覆盖占比；衡量媒体注意力，不等同中国居民搜索或申购意愿。",
    }


def board_validation(board: str) -> dict:
    payload = get_json(
        "https://push2his.eastmoney.com/api/qt/stock/kline/get",
        {
            "secid": f"90.{board}", "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": "101", "fqt": "1", "beg": "20250101", "end": "20500101",
        },
    ).get("data") or {}
    rows = []
    for raw in payload.get("klines") or []:
        parts = raw.split(",")
        if len(parts) >= 7:
            rows.append({"date": parts[0], "close": float(parts[2]), "amount": float(parts[6])})
    if len(rows) < 80:
        raise ValueError(f"Eastmoney returned only {len(rows)} board observations")
    recent_amount = fmean(row["amount"] for row in rows[-20:])
    prior_amount = fmean(row["amount"] for row in rows[-80:-20]) or 1e-9
    start = rows[-120]["close"] if len(rows) >= 120 else rows[0]["close"]
    momentum = (rows[-1]["close"] / start - 1) * 100
    amount_change = (recent_amount / prior_amount - 1) * 100
    score = clamp(50 + clamp(momentum, -40, 60) * 0.45 + clamp(amount_change, -60, 100) * 0.20)
    return {
        "score": round(score, 1),
        "momentumPercent": round(momentum, 1),
        "turnoverChangePercent": round(amount_change, 1),
        "asOf": rows[-1]["date"],
        "observations": len(rows),
        "source": "东方财富公开概念板块日线",
        "sourceUrl": "https://push2his.eastmoney.com/api/qt/stock/kline/get",
        "status": "真实公开代理",
        "note": "价格与成交趋势只代表资本市场验证代理，不替代行业产量、订单、收入或利润。",
    }


def asset_capacity() -> dict[str, dict]:
    if not PRE_EVIDENCE.exists():
        return {}
    payload = json.loads(PRE_EVIDENCE.read_text(encoding="utf-8-sig"))
    values = {
        item["id"]: item.get("assets", {}).get("floatMarketCapYi")
        for item in payload.get("items", [])
        if isinstance(item.get("assets", {}).get("floatMarketCapYi"), (int, float))
    }
    ordered = sorted(values.values())
    result = {}
    for theme_id, value in values.items():
        percentile = (ordered.index(value) + 1) / len(ordered)
        result[theme_id] = {
            "score": round(30 + percentile * 65, 1), "floatMarketCapYi": value,
            "source": "东方财富公开板块行情", "status": "真实公开数据",
        }
    return result


def load_previous() -> dict:
    if not OUT.exists():
        return {}
    try:
        return {item["id"]: item for item in json.loads(OUT.read_text(encoding="utf-8")).get("items", [])}
    except (ValueError, OSError):
        return {}


def main() -> None:
    previous = load_previous()
    capacities = asset_capacity()
    items = []
    for index, (theme_id, query, board) in enumerate(THEMES):
        old = previous.get(theme_id, {})
        errors = []
        try:
            attention = gdelt_attention(query)
        except Exception as exc:  # keep the last usable snapshot on transient failures
            attention = old.get("attention")
            errors.append(f"attention: {type(exc).__name__}")
        if index < len(THEMES) - 1:
            time.sleep(5.2)  # GDELT public endpoint asks clients to stay below 1 request / 5 seconds
        try:
            validation = board_validation(board)
        except Exception as exc:
            validation = old.get("validation")
            errors.append(f"validation: {type(exc).__name__}")
        capacity = capacities.get(theme_id) or old.get("capacity")
        verified = bool(attention and validation and capacity)
        items.append({
            "id": theme_id, "query": query, "boardCode": board, "verified": verified,
            "attention": attention, "validation": validation, "capacity": capacity,
            "errors": errors,
        })
    verified_count = sum(bool(item["verified"]) for item in items)
    output = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(),
        "methodologyVersion": "attention-public-proxy-v1",
        "universeCount": 36,
        "mappedCount": len(THEMES),
        "verifiedCount": verified_count,
        "items": items,
        "disclosure": "媒体注意力和资本市场验证均为公开代理；不替代企业经营、客户调研或投资结论。",
    }
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT}: {verified_count}/{len(THEMES)} mapped themes verified")
    if verified_count == 0:
        raise SystemExit("no theme retained a complete real-data snapshot")


if __name__ == "__main__":
    main()

