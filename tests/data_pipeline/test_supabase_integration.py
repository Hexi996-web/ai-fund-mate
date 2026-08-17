"""Opt-in contract test for a disposable PostgreSQL database.

Set SIGNAL_TEST_POSTGRES_URL to a database whose name starts with
``signal_test_``. The test deliberately replaces that database's public schema.
It never reads SUPABASE_DB_URL or any production credential.
"""

from __future__ import annotations

import os
from contextlib import nullcontext
from pathlib import Path
from urllib.parse import urlsplit

import pytest

from data_pipeline.supabase_storage import SupabaseSignalRepository


TEST_URL = os.environ.get("SIGNAL_TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(
    not TEST_URL,
    reason="set SIGNAL_TEST_POSTGRES_URL to an explicitly disposable PostgreSQL database",
)


def _assert_disposable(url: str) -> None:
    database = urlsplit(url).path.lstrip("/")
    if not database.startswith("signal_test_"):
        pytest.fail("SIGNAL_TEST_POSTGRES_URL database name must start with signal_test_")


def _expect_denied(connection, statement: str) -> None:
    with pytest.raises(Exception):
        connection.execute(statement)


def test_migration_enforces_writer_anon_and_published_view_contract():
    _assert_disposable(TEST_URL)
    psycopg = pytest.importorskip("psycopg")
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase" / "migrations" / "202608140001_signal_intelligence.sql"
    ).read_text(encoding="utf-8")

    with psycopg.connect(TEST_URL, autocommit=True) as connection:
        connection.execute("DROP SCHEMA IF EXISTS public CASCADE")
        connection.execute("CREATE SCHEMA public")
        try:
            for role in ("anon", "authenticated"):
                if not connection.execute(
                    "SELECT 1 FROM pg_roles WHERE rolname=%s", (role,),
                ).fetchone():
                    connection.execute(f'CREATE ROLE "{role}" NOLOGIN')
            connection.execute(migration)

            connection.execute("SET ROLE signal_pipeline_writer")
            repository = SupabaseSignalRepository(TEST_URL)
            repository._connect = lambda: nullcontext(connection)
            repository.initialize()
            connection.execute(
                "INSERT INTO sources (id, name, url, source_tier) "
                "VALUES ('crud', 'CRUD', 'https://example.test/crud', 'official')"
            )
            connection.execute("UPDATE sources SET name='updated' WHERE id='crud'")
            assert connection.execute("SELECT name FROM sources WHERE id='crud'").fetchone()[0] == "updated"
            connection.execute("DELETE FROM sources WHERE id='crud'")
            connection.execute(
                "INSERT INTO event_clusters (id, title, category, created_at, updated_at) VALUES "
                "('cluster', 'Cluster', 'policy', now(), now())"
            )
            connection.execute(
                "INSERT INTO signals (id, cluster_id, category, title, summary, priority, "
                "source_confidence, customer_demand_score, demand_kind, validation_status, "
                "published_at, created_at, updated_at) VALUES "
                "('published', 'cluster', 'policy', 'Published', 'Visible', 1, .9, .5, "
                "'unknown', 'confirmed', now(), now(), now()), "
                "('draft', 'cluster', 'policy', 'Draft secret', 'Hidden', 2, .9, .5, "
                "'unknown', 'confirmed', NULL, now(), now())"
            )
            connection.execute(
                "INSERT INTO daily_briefs (id, window_start, window_end, generated_at, body, status, signal_ids) VALUES "
                "('safe', now() - interval '1 day', now(), now(), 'Published only', 'published', '[\"published\"]'), "
                "('leak', now() - interval '1 day', now(), now(), 'Draft secret', 'published', '[\"draft\"]'), "
                "('catalyst-leak', now() - interval '1 day', now(), now(), '[draft-catalyst] Draft secret', 'published', '[\"published\"]')"
            )
            connection.execute(
                "INSERT INTO catalysts (id, signal_id, title, scheduled_at, priority, description, validation_status) VALUES "
                "('draft-catalyst', 'draft', 'Draft catalyst', now() + interval '1 day', 5, '', 'confirmed')"
            )

            connection.execute("SET ROLE anon")
            _expect_denied(connection, "SELECT * FROM sources")
            _expect_denied(
                connection,
                "INSERT INTO sources (id, name, url, source_tier) "
                "VALUES ('anon', 'Anon', 'https://example.test/anon', 'official')",
            )
            assert connection.execute("SELECT id FROM published_signals ORDER BY id").fetchall() == [("published",)]
            assert connection.execute("SELECT id FROM published_daily_briefs ORDER BY id").fetchall() == [("safe",)]
            _expect_denied(connection, "DELETE FROM published_daily_briefs")
        finally:
            connection.execute("RESET ROLE")
            connection.execute("DROP SCHEMA IF EXISTS public CASCADE")
            connection.execute("CREATE SCHEMA public")
