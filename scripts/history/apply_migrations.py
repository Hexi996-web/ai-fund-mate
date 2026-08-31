"""Apply checksum-verified PostgreSQL migrations for the history platform."""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from pathlib import Path

MIGRATION_PATTERN = re.compile(r"^[0-9]{3}_[a-z0-9_]+\.sql$")


def discover_migrations(directory: Path) -> list[Path]:
    migrations = sorted(path for path in directory.glob("*.sql") if MIGRATION_PATTERN.match(path.name))
    if not migrations:
        raise ValueError(f"没有找到迁移文件：{directory}")
    return migrations


def migration_checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def database_url() -> str | None:
    return os.getenv("HISTORY_DATABASE_URL") or os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")


def apply(directory: Path, dry_run: bool = False) -> list[dict[str, str]]:
    migrations = discover_migrations(directory)
    plan = [{"version": path.stem.split("_", 1)[0], "name": path.name, "checksum": migration_checksum(path)} for path in migrations]
    if dry_run:
        return plan
    url = database_url()
    if not url:
        raise RuntimeError("缺少 HISTORY_DATABASE_URL、DATABASE_URL 或 SUPABASE_DB_URL")
    import psycopg
    with psycopg.connect(url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""create table if not exists public.history_schema_migrations (
              version text primary key, migration_name text not null, checksum text not null,
              applied_at timestamptz not null default now())""")
            cursor.execute("select version, checksum from public.history_schema_migrations")
            applied = dict(cursor.fetchall())
            for migration, item in zip(migrations, plan):
                previous = applied.get(item["version"])
                if previous and previous != item["checksum"]:
                    raise RuntimeError(f"迁移 {item['version']} 的校验和与数据库记录不一致")
                if previous:
                    item["status"] = "already_applied"
                    continue
                cursor.execute(migration.read_text(encoding="utf-8"))
                cursor.execute("""insert into public.history_schema_migrations
                  (version, migration_name, checksum) values (%s, %s, %s)""",
                  (item["version"], item["name"], item["checksum"]))
                item["status"] = "applied"
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description="执行 AI Fund Mate 历史数据库迁移")
    parser.add_argument("--migrations-dir", type=Path, default=Path("database/migrations"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        plan = apply(args.migrations_dir, args.dry_run)
    except Exception as error:
        print(f"迁移失败：{type(error).__name__}: {str(error)[:500]}", file=sys.stderr)
        return 1
    for item in plan:
        print(f"{item['version']} {item['name']} {item.get('status', 'pending')} {item['checksum'][:12]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
