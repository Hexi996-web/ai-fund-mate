"""Refresh due industry-demand sources without forcing daily data changes."""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import akshare as ak

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "industry_demand_sources.json"

REGISTRY = {
    "power-electricity-monthly": {
        "themeId": "power", "metricName": "全社会用电量", "role": "渗透与采用",
        "baseWeightPercent": 35, "cadence": "monthly", "expectedLagDays": 45,
        "sourceName": "国家统计局口径／AKShare全社会用电分类接口",
        "sourceUrl": "https://data.stats.gov.cn/",
    },
    "inbound-tourism-fx-annual": {
        "themeId": "inbound-consumption", "metricName": "入境游客消费", "role": "核心需求结果",
        "baseWeightPercent": 45, "cadence": "annual", "expectedLagDays": 120,
        "sourceName": "国家统计局口径／AKShare国际旅游外汇收入接口",
        "sourceUrl": "https://data.stats.gov.cn/",
    },
}


def normalize_period(value) -> str:
    text = str(value).strip()
    if "." in text:
        year, month = text.split(".", 1)
        return f"{int(year):04d}-{int(month):02d}"
    return f"{int(float(text)):04d}"


def rows_from_frame(frame, date_col=0, value_col=1, unit="") -> list[dict]:
    rows = []
    for _, record in frame.iterrows():
        try:
            period = normalize_period(record.iloc[date_col])
            value = float(record.iloc[value_col])
        except (TypeError, ValueError, OverflowError):
            continue
        rows.append({"dataDate": period, "value": value, "unit": unit})
    return sorted({row["dataDate"]: row for row in rows}.values(), key=lambda row: row["dataDate"])


def fetch_power_electricity() -> list[dict]:
    frame = ak.macro_china_society_electricity()
    return rows_from_frame(frame, 0, 1, "万千瓦时")


def fetch_inbound_tourism_fx() -> list[dict]:
    frame = ak.macro_china_international_tourism_fx()
    # Rows labelled 总计 are the first/latest record for each year; position-based access avoids locale-dependent column labels.
    totals = frame.groupby(frame.columns[0], sort=False).head(1)
    return rows_from_frame(totals, 0, 2, "万美元")


FETCHERS = {
    "power-electricity-monthly": fetch_power_electricity,
    "inbound-tourism-fx-annual": fetch_inbound_tourism_fx,
}


def next_check(latest: str, cadence: str, lag_days: int) -> str:
    if cadence == "monthly":
        year, month = map(int, latest.split("-"))
        next_month = date(year + (month == 12), month % 12 + 1, 1)
        candidate = next_month + timedelta(days=lag_days)
        retry_days = 7
    else:
        candidate = date(int(latest) + 1, 1, 1) + timedelta(days=lag_days)
        retry_days = 30
    # Once an expected release date has passed, check periodically rather than on every daily run.
    if candidate <= date.today():
        candidate = date.today() + timedelta(days=retry_days)
    return candidate.isoformat()


def add_yoy(rows: list[dict], cadence: str) -> list[dict]:
    lookup = {row["dataDate"]: row["value"] for row in rows}
    for row in rows:
        if cadence == "monthly":
            year, month = row["dataDate"].split("-")
            base = lookup.get(f"{int(year)-1}-{month}")
        else:
            base = lookup.get(str(int(row["dataDate"]) - 1))
        row["yoyPercent"] = round((row["value"] / base - 1) * 100, 2) if base else None
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"sources": []}
    previous_map = {row["id"]: row for row in previous.get("sources", [])}
    today = date.today().isoformat()
    changed = False
    sources = []
    for source_id, config in REGISTRY.items():
        old = previous_map.get(source_id, {})
        due = args.force or not old.get("observations") or today >= old.get("nextCheckAt", "0000-00-00")
        if not due:
            sources.append(old)
            continue
        checked_at = datetime.now().astimezone().isoformat()
        try:
            observations = add_yoy(FETCHERS[source_id](), config["cadence"])[-120:]
            if not observations:
                raise ValueError("empty source")
            latest = observations[-1]["dataDate"]
            for observation in observations:
                observation.setdefault("publishedAt", None)
                observation["collectedAt"] = checked_at
            row = {"id": source_id, **config, "status": "active", "lastCheckedAt": checked_at,
                   "latestDataDate": latest, "nextCheckAt": next_check(latest, config["cadence"], config["expectedLagDays"]),
                   "observations": observations}
        except Exception as exc:
            row = {**old, "id": source_id, **config, "status": "error", "lastCheckedAt": checked_at,
                   "lastError": type(exc).__name__}
        sources.append(row)
        comparable_old = {k: v for k, v in old.items() if k not in ("lastCheckedAt", "lastError", "status")}
        comparable_new = {k: v for k, v in row.items() if k not in ("lastCheckedAt", "lastError", "status")}
        changed |= comparable_old != comparable_new or old.get("status") != row.get("status")
    if changed or not OUT.exists():
        payload = {"schemaVersion": 1, "updatedAt": datetime.now().astimezone().isoformat(), "sources": sources}
        OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"updated {OUT}: {sum(row.get('status') == 'active' for row in sources)}/{len(sources)} active")
    else:
        print("no due industry-demand data changes")


if __name__ == "__main__":
    main()
