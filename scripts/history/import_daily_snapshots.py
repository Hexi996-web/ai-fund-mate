"""Archive and import the current public JSON snapshots into PostgreSQL."""
import argparse, gzip, hashlib, json, os, shutil, sys
from pathlib import Path

from scripts.history.snapshot_models import (
    attention_daily_rows, attention_raw_rows, dataset_row_count, historical_theme_signal_rows,
    infer_snapshot_date, product_metric_rows, product_rows, share_observation_rows, share_rows,
    theme_rows, theme_signal_rows,
)

DATASETS = ("fund_products", "funds_active", "attention_pool_evidence", "pre_research_evidence",
            "social_attention_history", "theme_external_signals", "issuance_insights")


def load(path):
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def archive(source, root, name, day):
    target = root / name / f"{day:%Y}" / f"{day:%m}" / f"{day:%d}.json.gz"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    with source.open("rb") as input_file, gzip.open(temporary, "wb") as output_file:
        shutil.copyfileobj(input_file, output_file)
    temporary.replace(target)
    return target


def insert_batches(cursor, statement, rows, json_indexes=()):
    from psycopg.types.json import Jsonb
    for start in range(0, len(rows), 1000):
        batch = [tuple(Jsonb(value) if index in json_indexes else value for index, value in enumerate(row))
                 for row in rows[start:start + 1000]]
        cursor.executemany(statement, batch)


def register_snapshot(cursor, run_id, name, day, path, digest, payload):
    from psycopg.types.json import Jsonb
    cursor.execute("""insert into data_snapshots
      (pipeline_run_id,dataset_name,snapshot_date,schema_version,storage_path,content_hash,row_count,generated_at,metadata)
      values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
      on conflict (dataset_name,snapshot_date,content_hash)
      do update set pipeline_run_id=excluded.pipeline_run_id, imported_at=now() returning id""",
      (run_id, name, day, int(payload.get("schemaVersion") or 1), path.as_posix(), digest,
       dataset_row_count(name, payload), payload.get("generatedAt") or payload.get("updateTime"), Jsonb({})))
    return cursor.fetchone()[0]


def import_funds(cursor, payloads, refs):
    products, funds = payloads["fund_products"], payloads["funds_active"]
    product_day, product_snapshot = refs["fund_products"]; fund_day, fund_snapshot = refs["funds_active"]
    insert_batches(cursor, """insert into fund_products
      (product_id,product_name,fund_type,established_date,first_seen_date,last_seen_date,grouping_confidence,attributes)
      values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict (product_id) do update set
      product_name=excluded.product_name,fund_type=excluded.fund_type,
      established_date=coalesce(excluded.established_date,fund_products.established_date),
      last_seen_date=excluded.last_seen_date,is_active=true,grouping_confidence=excluded.grouping_confidence,updated_at=now()""",
      product_rows(products, product_day), {7})
    insert_batches(cursor, """insert into fund_shares
      (fund_code,product_id,fund_name,fund_type,share_class,established_date,first_seen_date,last_seen_date,is_active,grouping_confidence,grouping_rule,attributes)
      values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (fund_code) do update set
      product_id=excluded.product_id,fund_name=excluded.fund_name,fund_type=excluded.fund_type,share_class=excluded.share_class,
      established_date=coalesce(excluded.established_date,fund_shares.established_date),last_seen_date=excluded.last_seen_date,
      is_active=excluded.is_active,grouping_confidence=excluded.grouping_confidence,grouping_rule=excluded.grouping_rule,updated_at=now()""",
      share_rows(funds, fund_day), {11})
    insert_batches(cursor, """insert into fund_share_daily_observations
      (fund_code,data_date,net_value,daily_change_percent,scale_yi,total_shares_yi,scale_date,shares_date,purchase_status,
       redemption_status,operation_status,scale_status,scale_quality,scale_source,source_updated_at,snapshot_id,raw_attributes)
      values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      on conflict (fund_code,data_date) do update set net_value=excluded.net_value,daily_change_percent=excluded.daily_change_percent,
      scale_yi=excluded.scale_yi,total_shares_yi=excluded.total_shares_yi,scale_date=excluded.scale_date,shares_date=excluded.shares_date,
      purchase_status=excluded.purchase_status,redemption_status=excluded.redemption_status,operation_status=excluded.operation_status,
      scale_status=excluded.scale_status,scale_quality=excluded.scale_quality,scale_source=excluded.scale_source,
      source_updated_at=excluded.source_updated_at,ingested_at=now(),snapshot_id=excluded.snapshot_id""",
      share_observation_rows(funds, fund_day, fund_snapshot), {16})
    insert_batches(cursor, """insert into fund_product_daily_metrics
      (product_id,data_date,representative_fund_code,share_count,current_scale_yi,baseline_scale_yi,baseline_scale_date,
       scale_net_increase_yi,scale_growth_percent,representative_nav,nav_growth_percent,max_drawdown_percent,
       drawdown_start_date,drawdown_end_date,metrics_coverage_start,metrics_version,source_updated_at,snapshot_id,raw_attributes)
      values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      on conflict (product_id,data_date,metrics_version) do update set current_scale_yi=excluded.current_scale_yi,
      scale_net_increase_yi=excluded.scale_net_increase_yi,scale_growth_percent=excluded.scale_growth_percent,
      representative_nav=excluded.representative_nav,nav_growth_percent=excluded.nav_growth_percent,
      max_drawdown_percent=excluded.max_drawdown_percent,source_updated_at=excluded.source_updated_at,
      calculated_at=now(),snapshot_id=excluded.snapshot_id""",
      product_metric_rows(products, product_day, product_snapshot), {18})


def import_themes(cursor, payloads, refs):
    attention = payloads["attention_pool_evidence"]; day, snapshot = refs["attention_pool_evidence"]
    insert_batches(cursor, """insert into research_themes
      (theme_id,theme_name,query_text,board_code,first_seen_date,last_seen_date,attributes)
      values (%s,%s,%s,%s,%s,%s,%s) on conflict (theme_id) do update set theme_name=excluded.theme_name,
      query_text=excluded.query_text,board_code=excluded.board_code,last_seen_date=excluded.last_seen_date,is_active=true,updated_at=now()""",
      theme_rows(attention, day), {6})
    insert_batches(cursor, """insert into theme_daily_signals
      (theme_id,data_date,methodology_version,attention_score,validation_score,capacity_score,composite_score,rank,
       lifecycle_state,evidence,source_updated_at,snapshot_id) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      on conflict (theme_id,data_date,methodology_version) do update set attention_score=excluded.attention_score,
      validation_score=excluded.validation_score,capacity_score=excluded.capacity_score,composite_score=excluded.composite_score,
      rank=excluded.rank,lifecycle_state=excluded.lifecycle_state,evidence=excluded.evidence,
      source_updated_at=excluded.source_updated_at,ingested_at=now(),snapshot_id=excluded.snapshot_id""",
      theme_signal_rows(attention, day, snapshot), {9})
    history = payloads["social_attention_history"]; _, history_snapshot = refs["social_attention_history"]
    insert_batches(cursor, """insert into theme_attention_daily
      (theme_id,data_date,appearances,resonance,best_rank,sample_count,source_updated_at,snapshot_id)
      values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict (theme_id,data_date) do update set
      appearances=excluded.appearances,resonance=excluded.resonance,best_rank=excluded.best_rank,sample_count=excluded.sample_count,
      source_updated_at=excluded.source_updated_at,ingested_at=now(),snapshot_id=excluded.snapshot_id""",
      attention_daily_rows(history, history_snapshot))
    insert_batches(cursor, """insert into attention_raw_samples (captured_at,sources,errors)
      values (%s,%s,%s) on conflict (captured_at) do update set
      sources=excluded.sources,errors=excluded.errors,ingested_at=now()""",
      attention_raw_rows(history), {1, 2})
    insert_batches(cursor, """insert into theme_daily_signals
      (theme_id,data_date,methodology_version,attention_score,validation_score,capacity_score,composite_score,rank,lifecycle_state,evidence)
      values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      on conflict (theme_id,data_date,methodology_version) do update set
      attention_score=coalesce(excluded.attention_score,theme_daily_signals.attention_score),
      validation_score=coalesce(excluded.validation_score,theme_daily_signals.validation_score),
      capacity_score=coalesce(excluded.capacity_score,theme_daily_signals.capacity_score),
      composite_score=coalesce(excluded.composite_score,theme_daily_signals.composite_score),
      rank=coalesce(excluded.rank,theme_daily_signals.rank),
      lifecycle_state=coalesce(excluded.lifecycle_state,theme_daily_signals.lifecycle_state),
      evidence=theme_daily_signals.evidence,
      ingested_at=now()""",
      historical_theme_signal_rows(attention), {9})


def main():
    parser = argparse.ArgumentParser(description="累计导入 AI Fund Mate 每日快照")
    parser.add_argument("--source-dir", type=Path, default=Path("public")); parser.add_argument("--archive-dir", type=Path)
    parser.add_argument("--dry-run", action="store_true"); args = parser.parse_args()
    payloads = {}; hashes = {}; dates = {}
    for name in DATASETS:
        path = args.source_dir / f"{name}.json"
        if not path.exists(): print(f"缺少快照：{path}", file=sys.stderr); return 2
        payloads[name], hashes[name] = load(path); dates[name] = infer_snapshot_date(name, payloads[name])
    summary = {name: {"date": str(dates[name]), "rows": dataset_row_count(name, payloads[name])} for name in DATASETS}
    if args.dry_run: print(json.dumps(summary, ensure_ascii=False, indent=2)); return 0
    from .database_url import database_url as resolve_database_url
    try: database_url = resolve_database_url(required=True)
    except RuntimeError as error: print(str(error), file=sys.stderr); return 2
    try: import psycopg
    except ImportError: print("请先安装 requirements-data.txt", file=sys.stderr); return 2
    digest = hashlib.sha256("".join(hashes.values()).encode()).hexdigest()[:16]; run_date = max(dates.values())
    run_key = f"daily-snapshots:{run_date}:{digest}"
    with psycopg.connect(database_url, options="-c search_path=history,public", prepare_threshold=None) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""insert into pipeline_runs (run_key,pipeline_name,data_date,status,source_commit)
              values (%s,'daily-snapshots',%s,'running',%s) on conflict (run_key) do update set
              status='running',started_at=now(),error_summary=null returning id""", (run_key, run_date, os.getenv("GITHUB_SHA")))
            run_id = cursor.fetchone()[0]
        connection.commit()
        try:
            with connection.cursor() as cursor:
                refs = {}
                for name in DATASETS:
                    source = args.source_dir / f"{name}.json"
                    stored = archive(source, args.archive_dir, name, dates[name]) if args.archive_dir else source
                    refs[name] = (dates[name], register_snapshot(cursor, run_id, name, dates[name], stored, hashes[name], payloads[name]))
                import_funds(cursor, payloads, refs); import_themes(cursor, payloads, refs)
                from psycopg.types.json import Jsonb
                cursor.execute("update pipeline_runs set status='succeeded',completed_at=now(),metadata=%s where id=%s", (Jsonb(summary), run_id))
            connection.commit()
        except Exception as error:
            connection.rollback()
            with connection.cursor() as cursor:
                cursor.execute("update pipeline_runs set status='failed',completed_at=now(),error_summary=%s where id=%s",
                               (f"{type(error).__name__}: {str(error)[:500]}", run_id))
            connection.commit()
            raise
    print(json.dumps({"runKey": run_key, "status": "succeeded", "datasets": summary}, ensure_ascii=False, indent=2)); return 0


if __name__ == "__main__": raise SystemExit(main())
