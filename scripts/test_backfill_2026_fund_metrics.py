import json
from datetime import datetime, timezone

from backfill_2026_fund_metrics import calculate_metrics


def millis(day):
    return int(datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp() * 1000)


def test_calculates_full_2026_nav_scale_and_drawdown_metrics():
    nav = [[millis("2026-01-02"), 1.0], [millis("2026-03-01"), 1.2], [millis("2026-06-01"), 0.9], [millis("2026-08-20"), 1.1]]
    scale = {
        "categories": ["2025-12-31", "2026-03-31", "2026-06-30"],
        "series": [{"y": 100}, {"y": 130}, {"y": 120}],
    }
    content = f"var Data_ACWorthTrend = {json.dumps(nav)};var Data_fluctuationScale = {json.dumps(scale)};"
    result = calculate_metrics(content)
    assert result["baselineScaleYi"] == 100
    assert result["currentScaleYi"] == 120
    assert result["scaleNetIncreaseYi"] == 20
    assert result["scaleGrowthPercent"] == 20
    assert result["navGrowthPercent"] == 10
    assert result["maxDrawdownPercent"] == -25
    assert result["drawdownStartDate"] == "2026-03-01"
    assert result["drawdownEndDate"] == "2026-06-01"


def test_prefers_unit_nav_when_adjusted_nav_has_a_different_quote_scale():
    unit_nav = [[millis("2026-01-02"), 107.13], [millis("2026-08-20"), 110.6164]]
    adjusted_nav = [[millis("2026-01-02"), 1.0713], [millis("2026-08-20"), 1.1062]]
    content = (
        f"var Data_ACWorthTrend = {json.dumps(adjusted_nav)};"
        f"var Data_netWorthTrend = {json.dumps(unit_nav)};"
    )
    result = calculate_metrics(content)
    assert result["ytdStartNav"] == 107.13
    assert result["representativeNav"] == 110.6164
    assert result["navGrowthPercent"] == 3.2544
