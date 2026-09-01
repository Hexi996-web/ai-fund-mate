from datetime import date

import pandas as pd

from scripts.update_industry_demand_sources import add_yoy, next_check, rows_from_frame


def test_monthly_rows_and_yoy_are_period_aligned():
    frame = pd.DataFrame([[2025.7, 100], [2026.7, 110]])
    rows = add_yoy(rows_from_frame(frame), "monthly")
    assert rows[-1]["dataDate"] == "2026-07"
    assert rows[-1]["yoyPercent"] == 10.0


def test_overdue_annual_source_is_not_rechecked_daily():
    scheduled = date.fromisoformat(next_check("2025", "annual", 120))
    assert scheduled >= date.today()
    assert (scheduled - date.today()).days >= 29
