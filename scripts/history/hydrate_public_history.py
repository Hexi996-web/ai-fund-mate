"""Restore working history from PostgreSQL before generating the next public snapshot."""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def atomic_write(path: Path, payload: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    url = os.getenv("HISTORY_DATABASE_URL") or os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if not url:
        print("历史数据库未配置，使用仓库内回退历史")
        return 0
    import psycopg
    from psycopg.rows import dict_row

    social_path = ROOT / "public" / "social_attention_history.json"
    attention_path = ROOT / "public" / "attention_pool_evidence.json"
    social = json.loads(social_path.read_text(encoding="utf-8"))
    attention = json.loads(attention_path.read_text(encoding="utf-8"))

    with psycopg.connect(url, options="-c search_path=history,public", row_factory=dict_row, prepare_threshold=None) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""select captured_at,sources,errors from attention_raw_samples
              where captured_at >= now() - interval '90 days' order by captured_at""")
            snapshots = [{"capturedAt": row["captured_at"].isoformat(), "sources": row["sources"], "errors": row["errors"]}
                         for row in cursor.fetchall()]
            cursor.execute("""select theme_id,data_date,appearances,resonance,best_rank,sample_count
              from theme_attention_daily where data_date >= current_date - 1095 order by data_date,theme_id""")
            daily_by_date = {}
            for row in cursor.fetchall():
                key = row["data_date"].isoformat()
                bucket = daily_by_date.setdefault(key, {"date": key, "samples": row["sample_count"] or 0, "themes": {}})
                bucket["samples"] = max(bucket["samples"], row["sample_count"] or 0)
                bucket["themes"][row["theme_id"]] = {"appearances": row["appearances"], "resonance": row["resonance"], "bestRank": row["best_rank"]}
            cursor.execute("""select theme_id,data_date,methodology_version,attention_score,validation_score,
              capacity_score,rank,lifecycle_state,evidence from theme_daily_signals
              where data_date >= current_date - 1095 order by data_date,rank nulls last,theme_id""")
            ranking_by_date = {}
            for row in cursor.fetchall():
                key = row["data_date"].isoformat()
                bucket = ranking_by_date.setdefault(key, {"date": key, "period": f"{row['data_date'].year}-Q{(row['data_date'].month-1)//3+1}", "rankedIds": [], "recommendedIds": [], "scores": {}, "states": {}, "modelVersion": row["methodology_version"]})
                if row["rank"]:
                    bucket["rankedIds"].append((row["rank"], row["theme_id"]))
                    if row["rank"] <= 10:
                        bucket["recommendedIds"].append((row["rank"], row["theme_id"]))
                bucket["scores"][row["theme_id"]] = {name: float(row[name]) if row[name] is not None else None for name in ("attention_score", "validation_score", "capacity_score")}
                bucket["scores"][row["theme_id"]] = {key.removesuffix("_score"): value for key, value in bucket["scores"][row["theme_id"]].items()}
                if row["lifecycle_state"]:
                    evidence = row["evidence"] if isinstance(row["evidence"], dict) else {}
                    bucket["states"][row["theme_id"]] = {"state": row["lifecycle_state"], **{key: evidence[key] for key in ("reason", "action", "label") if key in evidence}}

    existing_snapshots = {item.get("capturedAt"): item for item in social.get("snapshots", []) if item.get("capturedAt")}
    existing_snapshots.update({item["capturedAt"]: item for item in snapshots})
    social["snapshots"] = sorted(existing_snapshots.values(), key=lambda item: item["capturedAt"])
    existing_daily = {item.get("date"): item for item in social.get("daily", []) if item.get("date")}
    existing_daily.update(daily_by_date)
    social["daily"] = [existing_daily[key] for key in sorted(existing_daily)]
    ranking = {item.get("date"): item for item in attention.get("rankingHistory", []) if item.get("date")}
    for key, item in ranking_by_date.items():
        item["rankedIds"] = [theme_id for _, theme_id in sorted(item["rankedIds"])]
        item["recommendedIds"] = [theme_id for _, theme_id in sorted(item["recommendedIds"])]
        ranking[key] = {**ranking.get(key, {}), **item}
    attention["rankingHistory"] = [ranking[key] for key in sorted(ranking)]
    atomic_write(social_path, social)
    atomic_write(attention_path, attention)
    print(f"已从数据库恢复 {len(social['snapshots'])} 个原始样本、{len(social['daily'])} 个日序列、{len(attention['rankingHistory'])} 期排名")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
