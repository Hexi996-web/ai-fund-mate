from forecasting.publish import build_scenario_publication
def test_one_history_point_publishes_no_probabilities():
    scores={"themes":[{"theme":"gold","score":57.5}]}
    result=build_scenario_publication([{"date":"2026-08-12","scores":scores}],min_points=5)
    assert result["themes"][0]["status"]=="insufficient_history"
    assert result["themes"][0]["scenarios"]==[]
