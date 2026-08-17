from datetime import datetime, timezone

import pytest

from scripts.run_signal_schedule import run_schedule, select_jobs


UTC = timezone.utc


def test_midnight_utc_runs_collect_brief_and_publish():
    assert select_jobs(datetime(2026, 8, 14, 0, 0, tzinfo=UTC)) == [
        "collect", "brief", "publish"
    ]


def test_delayed_midnight_hour_run_still_generates_idempotent_brief():
    assert select_jobs(datetime(2026, 8, 14, 0, 7, tzinfo=UTC)) == [
        "collect", "brief", "publish"
    ]


def test_other_hours_run_collect_and_publish_only():
    assert select_jobs(datetime(2026, 8, 14, 1, 0, tzinfo=UTC)) == [
        "collect", "publish"
    ]


def test_schedule_rejects_naive_timestamp():
    with pytest.raises(ValueError, match="timezone-aware"):
        select_jobs(datetime(2026, 8, 14, 0, 0))


def test_run_schedule_invokes_cli_in_order(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://example.invalid/db")
    monkeypatch.setattr(
        "scripts.run_signal_schedule.subprocess.run",
        lambda command, **options: calls.append((command, options)),
    )

    output = tmp_path / "signal-radar.json"
    run_schedule(datetime(2026, 8, 14, 0, 7, tzinfo=UTC), output)

    assert [call[0][3] for call in calls] == ["collect", "brief", "publish"]
    assert calls[0][0][-2:] == ["--as-of", "2026-08-14T00:07:00+00:00"]
    assert calls[1][0][-2:] == ["--run-at", "2026-08-14T00:07:00+00:00"]
    assert calls[2][0][-4:] == [
        "--output", str(output), "--generated-at", "2026-08-14T00:07:00+00:00"
    ]
    assert all(options["check"] is True for _, options in calls)


def test_run_schedule_requires_production_database(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_DB_URL"):
        run_schedule(datetime(2026, 8, 14, 1, 7, tzinfo=UTC))
