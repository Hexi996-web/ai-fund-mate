from data_pipeline.signal_anomaly import default_config, detect_anomaly


def test_nonofficial_spike_never_becomes_official_fact():
    result = detect_anomaly(40, 12, [2] * 30, default_config())

    assert result.triggered is True
    assert result.validation_status == "pending_official_validation"
    assert result.effective_weight <= .60


def test_anomaly_requires_independent_source_threshold():
    result = detect_anomaly(40, 1, [2] * 30, default_config())

    assert result.triggered is False
    assert result.effective_weight == 0.0


def test_anomaly_uses_30_day_median_and_mad_baseline():
    result = detect_anomaly(11, 3, [1] * 15 + [3] * 15, default_config())

    assert result.baseline_median == 2.0
    assert result.mad == 1.0
    assert result.triggered is True
