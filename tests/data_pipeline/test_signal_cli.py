import importlib
import json
from datetime import datetime, timedelta, timezone

import pytest

from data_pipeline.signal_cli import main, repository_for
from data_pipeline.signal_storage import SignalRepository
from data_pipeline.supabase_storage import SupabaseSignalRepository


def test_collect_without_supabase_uses_local_sqlite(tmp_path, monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    database = tmp_path / "signals.db"

    assert main([
        "collect", "--db", str(database), "--fixtures",
        "--as-of", "2026-08-14T00:00:00+00:00",
    ]) == 0

    repo = SignalRepository(database)
    assert repo.count_raw_items() > 0


def test_fixture_mode_never_uses_production_database_url(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://production.invalid/database")

    repo = repository_for(tmp_path / "fixtures.db", fixtures=True)

    assert isinstance(repo, SignalRepository)


def test_live_collect_isolates_sources_and_can_write_local_sqlite(tmp_path, monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    (fixtures / "feed.xml").write_text(
        "<rss><channel><item><title>Public release</title>"
        "<link>https://example.test/release</link>"
        "<description>Release body</description></item></channel></rss>",
        encoding="utf-8",
    )
    (fixtures / "calendar.ics").write_text(
        "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260814T123000Z\n"
        "SUMMARY:Release calendar\nEND:VEVENT\nEND:VCALENDAR\n",
        encoding="utf-8",
    )
    (fixtures / "list.html").write_text(
        '<ul><li><a href="/release">Public list release</a></li></ul>',
        encoding="utf-8",
    )

    def offline_fetch(url):
        if "bls.gov" in url:
            return (fixtures / "calendar.ics").read_text(encoding="utf-8")
        if "feeds" in url or "rss" in url:
            return (fixtures / "feed.xml").read_text(encoding="utf-8")
        return (fixtures / "list.html").read_text(encoding="utf-8")

    monkeypatch.setattr("data_pipeline.signal_cli._live_fetch", offline_fetch)
    database = tmp_path / "live.db"

    assert main([
        "collect", "--db", str(database),
        "--as-of", "2026-08-14T00:00:00+00:00",
    ]) == 0
    assert SignalRepository(database).count_raw_items() == 6


def test_postgres_driver_is_lazy_and_missing_driver_has_install_hint(monkeypatch):
    real_import_module = importlib.import_module

    def missing_psycopg(name, package=None):
        if name == "psycopg":
            raise ModuleNotFoundError("No module named 'psycopg'")
        return real_import_module(name, package)

    monkeypatch.setattr(importlib, "import_module", missing_psycopg)
    repo = SupabaseSignalRepository("postgresql://localhost/signals")

    with pytest.raises(RuntimeError, match=r"psycopg\[binary\]"):
        repo.initialize()


def test_fixture_cli_runs_collect_brief_publish_and_health_end_to_end(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    database = tmp_path / "signals.db"
    output = tmp_path / "signal-radar.json"

    assert main([
        "collect", "--db", str(database), "--fixtures",
        "--as-of", "2026-08-14T00:00:00+00:00",
    ]) == 0
    assert main([
        "brief", "--db", str(database),
        "--run-at", "2026-08-14T08:00:00+08:00",
    ]) == 0
    assert main([
        "publish", "--db", str(database), "--output", str(output),
        "--generated-at", "2026-08-14T00:00:00+00:00",
    ]) == 0
    assert main(["health", "--db", str(database)]) == 0

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["schemaVersion"] == 1
    assert payload["dailyBrief"]["id"] == "daily-brief-2026-08-14"
    health = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert health["status"] == "healthy"
    assert health["backend"] == "sqlite"


@pytest.mark.parametrize("value", ["2026-08-14T08:00:00", "not-a-time"])
def test_cli_rejects_naive_or_invalid_timestamps(tmp_path, value):
    with pytest.raises(SystemExit):
        main(["brief", "--db", str(tmp_path / "signals.db"), "--run-at", value])

def test_explicit_db_keeps_every_fixture_command_local_when_supabase_is_set(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://production.invalid/database")
    database = tmp_path / "signals.db"
    output = tmp_path / "signal-radar.json"

    assert main(["collect", "--db", str(database), "--fixtures"]) == 0
    assert main([
        "brief", "--db", str(database),
        "--run-at", "2026-08-14T08:00:00+08:00",
    ]) == 0
    assert main(["publish", "--db", str(database), "--output", str(output)]) == 0
    assert main(["health", "--db", str(database)]) == 0

    assert output.exists()

def test_collect_records_all_source_failure_and_returns_nonzero(tmp_path, monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

    def fail_fetch(_url):
        raise TimeoutError("offline")

    monkeypatch.setattr("data_pipeline.signal_cli._live_fetch", fail_fetch)
    database = tmp_path / "failed.db"

    assert main(["collect", "--db", str(database), "--as-of", "2026-08-14T00:00:00+00:00"]) == 1

    run = SignalRepository(database).list_runs()[0]
    assert run.status == "failed"
    assert json.loads(run.summary)["failedSources"] == 6


def test_collect_records_partial_source_failure(tmp_path, monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

    def partial_fetch(url):
        if "csrc.gov.cn" in url:
            raise TimeoutError("one source failed")
        if "bls.gov" in url:
            return "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260814T123000Z\nSUMMARY:Release\nEND:VEVENT\nEND:VCALENDAR\n"
        if "feeds" in url or "rss" in url:
            return "<rss><channel><item><title>Release</title><link>https://example.test/r</link></item></channel></rss>"
        return '<ul><li><a href="/release">Public release</a></li></ul>'

    monkeypatch.setattr("data_pipeline.signal_cli._live_fetch", partial_fetch)
    database = tmp_path / "partial.db"

    assert main(["collect", "--db", str(database), "--as-of", "2026-08-14T00:00:00+00:00"]) == 0
    assert SignalRepository(database).list_runs()[0].status == "partial"


def test_publish_filesystem_failure_is_recorded(tmp_path, monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    database = tmp_path / "signals.db"
    SignalRepository(database).initialize()

    with pytest.raises(OSError):
        main(["publish", "--db", str(database), "--output", str(tmp_path)])

    run = SignalRepository(database).list_runs()[0]
    assert run.command == "publish"
    assert run.status == "failed"


def test_health_cli_marks_old_collect_stale(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    old = datetime(2026, 8, 14, 0, tzinfo=timezone.utc)
    monkeypatch.setattr("data_pipeline.signal_cli._now", lambda: old, raising=False)
    database = tmp_path / "stale.db"

    assert main([
        "collect", "--db", str(database), "--fixtures",
        "--as-of", old.isoformat(),
    ]) == 0
    assert main([
        "health", "--db", str(database),
        "--generated-at", (old + timedelta(hours=3)).isoformat(),
    ]) == 0
    health = json.loads(capsys.readouterr().out.strip().splitlines()[-1])

    assert health["status"] == "degraded"
    assert health["fresh"] is False
