from __future__ import annotations

import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def snapshot_rows(payload):
    rows = []
    for fund in payload.get("funds", []):
        if fund.get("scaleYi") is None or not fund.get("scaleDate"):
            continue
        rows.append((
            fund["code"], fund["scaleDate"], fund.get("netValue"),
            fund.get("lastNetValueDate"), fund.get("totalSharesYi"),
            fund.get("sharesDate"), fund["scaleYi"], None, None,
            fund.get("scaleStatus"), fund.get("scaleQuality", "U"),
            fund.get("scaleStalenessDays"), fund.get("scaleSource"),
        ))
    return rows


def main():
    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        print("SUPABASE_DB_URL 未配置，跳过历史快照写入")
        return

    import psycopg

    payload = json.loads((ROOT / "public" / "funds_active.json").read_text(encoding="utf-8"))
    rows = snapshot_rows(payload)
    if not rows:
        print("没有可写入的规模估算快照")
        return
    sql = """
        insert into public.fund_scale_snapshots (
          fund_code, snapshot_date, unit_nav, nav_date, total_shares_yi,
          shares_date, estimated_scale_yi, reported_scale_yi,
          reported_scale_date, estimate_method, quality_grade,
          staleness_days, source
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (fund_code, snapshot_date) do update set
          unit_nav = excluded.unit_nav,
          nav_date = excluded.nav_date,
          total_shares_yi = excluded.total_shares_yi,
          shares_date = excluded.shares_date,
          estimated_scale_yi = excluded.estimated_scale_yi,
          estimate_method = excluded.estimate_method,
          quality_grade = excluded.quality_grade,
          staleness_days = excluded.staleness_days,
          source = excluded.source,
          collected_at = now()
    """
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(sql, rows)
    print(f"已写入 {len(rows)} 条规模估算快照")


if __name__ == "__main__":
    main()
