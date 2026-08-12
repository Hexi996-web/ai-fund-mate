from forecasting.scenarios import generate_theme_scenarios


def test_insufficient_history_never_invents_probabilities():
    result=generate_theme_scenarios("gold",[{"date":"2026-08-12","score":57.5}],min_points=5)
    assert result["status"]=="insufficient_history"
    assert result["scenarios"]==[]


def test_sufficient_history_probabilities_sum_to_one():
    rows=[{"date":f"2026-08-{day:02d}","score":50+day} for day in range(1,7)]
    result=generate_theme_scenarios("gold",rows,min_points=5)
    assert result["status"]=="ready"
    assert round(sum(x["probability"] for x in result["scenarios"]),6)==1
