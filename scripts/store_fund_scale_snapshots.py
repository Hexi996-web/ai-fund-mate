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


def issuance_baseline_rows(payload):
    return [(
        fund["productId"], fund["code"], fund["name"], fund["establishedDate"],
        fund.get("initialScaleYi"), "AKShare/东方财富公开数据",
    ) for fund in payload.get("scaleGrowth", {}).get("products", [])]


def product_scale_history_rows(payload):
    rows = []
    for fund in payload.get("scaleGrowth", {}).get("products", []):
        for point in fund.get("scaleHistory", []):
            rows.append((
                fund["productId"], point["date"], point["scaleYi"],
                point.get("shareCoverage", 1), point.get("kind", "reported"),
                "募集公告" if point.get("kind") == "launch" else "东方财富/天天基金网公开页面",
            ))
    return rows


def main():
    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        print("SUPABASE_DB_URL 未配置，跳过历史快照写入")
        return

    import psycopg

    payload = json.loads((ROOT / "public" / "funds_active.json").read_text(encoding="utf-8"))
    issuance_payload = json.loads((ROOT / "public" / "issuance_insights.json").read_text(encoding="utf-8"))
    rows = snapshot_rows(payload)
    baselines = issuance_baseline_rows(issuance_payload)
    product_history = product_scale_history_rows(issuance_payload)
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
    with psycopg.connect(database_url, prepare_threshold=None) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(sql, rows)
            cursor.executemany("""
                insert into public.fund_issuance_baselines (
                  product_id, representative_code, product_name, established_date,
                  initial_raised_shares_yi, source
                ) values (%s, %s, %s, %s, %s, %s)
                on conflict (product_id) do update set
                  representative_code = excluded.representative_code,
                  product_name = excluded.product_name,
                  established_date = excluded.established_date,
                  initial_raised_shares_yi = coalesce(public.fund_issuance_baselines.initial_raised_shares_yi, excluded.initial_raised_shares_yi),
                  source = excluded.source,
                  updated_at = now()
            """, baselines)
            cursor.executemany("""
                insert into public.fund_product_scale_history (
                  product_id, report_date, scale_yi, share_coverage, point_kind, source
                ) values (%s, %s, %s, %s, %s, %s)
                on conflict (product_id, report_date, point_kind) do update set
                  scale_yi = excluded.scale_yi,
                  share_coverage = excluded.share_coverage,
                  source = excluded.source,
                  collected_at = now()
            """, product_history)
    print(f"已写入 {len(rows)} 条规模估算快照、{len(baselines)} 条发行基准、{len(product_history)} 个产品规模历史点")


if __name__ == "__main__":
    main()
