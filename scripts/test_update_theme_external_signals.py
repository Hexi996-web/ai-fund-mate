from datetime import date

from scripts.update_theme_external_signals import incremental_start, merge_daily_rows


def test_incremental_start_continues_after_latest_observation():
    rows = [{"date": "2026-08-29", "views": 10}, {"date": "2026-08-30", "views": 12}]
    assert incremental_start(rows, date(2025, 9, 1)) == date(2026, 8, 31)


def test_merge_keeps_window_and_replaces_same_day():
    old = [{"date": "2025-08-31", "views": 1}, {"date": "2026-08-30", "views": 10}]
    new = [{"date": "2026-08-30", "views": 11}, {"date": "2026-08-31", "views": 12}]
    assert merge_daily_rows(old, new, date(2025, 9, 1)) == [
        {"date": "2026-08-30", "views": 11}, {"date": "2026-08-31", "views": 12}
    ]
