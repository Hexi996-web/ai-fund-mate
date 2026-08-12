from data_pipeline.finalize_quality import deduplicate_events, build_coverage


def test_quality_events_are_deduplicated_and_all_indicators_have_state():
    events = [
        {"source": "fred_real_yield", "status": "source_unavailable", "message": "timeout"},
        {"source": "fred_real_yield", "status": "source_unavailable", "message": "timeout"},
    ]
    assert len(deduplicate_events(events)) == 1
    indicators = {"x": object(), "y": object()}
    coverage = build_coverage(indicators, [{"indicator_id": "x"}], {"y": "source_unavailable"})
    assert coverage == {"x": "normal", "y": "source_unavailable"}
