"""Robust, explicitly non-official attention-anomaly detection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from .signal_baseline import robust_baseline
from .signal_config import configuration_fingerprint, default_config, nonnegative_number, resolve_config


@dataclass(frozen=True)
class AnomalyResult:
    """A reproducible anomaly result, never an official-fact assertion."""

    triggered: bool
    validation_status: str
    effective_weight: float
    baseline_median: float
    mad: float
    robust_z_score: float
    independent_source_count: int
    history_days: int
    config_version: str
    config_fingerprint: str
    reason: str


def detect_anomaly(
    current_count: int | float,
    independent_count: int,
    history: Sequence[int | float],
    config: Mapping | None = None,
) -> AnomalyResult:
    """Detect only independently corroborated spikes with a sufficient baseline."""
    payload = resolve_config(config)
    settings = payload["anomaly"]
    current = nonnegative_number(current_count, "current_count")
    independent = int(nonnegative_number(independent_count, "independent_count", integer=True))
    baseline = robust_baseline(
        history,
        history_days=settings["history_days"],
        mad_scale=settings["mad_scale"],
        zero_mad_floor=settings["zero_mad_floor"],
    )
    enough_history = len(baseline.values) >= int(settings["minimum_history_days"])
    robust_z = max(0.0, (current - baseline.median) / baseline.scale) if enough_history else 0.0
    has_independent_confirmation = independent >= int(settings["minimum_independent_sources"])
    triggered = enough_history and has_independent_confirmation and robust_z >= float(settings["robust_z_threshold"])
    raw_weight = min(1.0, robust_z / float(settings["robust_z_threshold"]))
    effective_weight = min(raw_weight, float(settings["nonofficial_weight_ceiling"])) if triggered else 0.0
    if not enough_history:
        reason = "insufficient_history"
    elif not has_independent_confirmation:
        reason = "insufficient_independent_sources"
    elif not triggered:
        reason = "below_anomaly_threshold"
    else:
        reason = "triggered"
    return AnomalyResult(
        triggered=triggered,
        validation_status="pending_official_validation",
        effective_weight=effective_weight,
        baseline_median=baseline.median,
        mad=baseline.mad,
        robust_z_score=robust_z,
        independent_source_count=independent,
        history_days=len(baseline.values),
        config_version=payload["version"],
        config_fingerprint=configuration_fingerprint(payload),
        reason=reason,
    )