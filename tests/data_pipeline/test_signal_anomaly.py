from copy import deepcopy

import pytest

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


@pytest.mark.parametrize("history", [[], [2] * 29])
def test_anomaly_requires_complete_history_before_triggering(history):
    result = detect_anomaly(40, 12, history, default_config())

    assert result.triggered is False
    assert result.reason == "insufficient_history"
    assert result.effective_weight == 0.0


def test_anomaly_rejects_unversioned_custom_configuration():
    config = default_config()
    del config["version"]

    with pytest.raises(ValueError, match="version"):
        detect_anomaly(40, 12, [2] * 30, config)


@pytest.mark.parametrize("path, value", [
    (("anomaly", "history_days"), 0),
    (("anomaly", "nonofficial_weight_ceiling"), 1.1),
])
def test_anomaly_rejects_invalid_numeric_configuration(path, value):
    config = default_config()
    target = config
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    with pytest.raises(ValueError):
        detect_anomaly(40, 12, [2] * 30, config)


def test_anomaly_rejects_incomplete_configuration_and_negative_counts():
    config = deepcopy(default_config())
    del config["anomaly"]["mad_scale"]

    with pytest.raises(ValueError, match="mad_scale"):
        detect_anomaly(40, 12, [2] * 30, config)
    with pytest.raises(ValueError, match="current_count"):
        detect_anomaly(-1, 12, [2] * 30, default_config())

def test_anomaly_rejects_empty_custom_configuration_instead_of_loading_defaults():
    with pytest.raises(ValueError, match="version"):
        detect_anomaly(40, 12, [2] * 30, {})