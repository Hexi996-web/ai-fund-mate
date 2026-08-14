"""Robust, explicitly non-official attention-anomaly detection."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Mapping, Sequence


_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "signal_scoring.json"


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


def default_config() -> dict:
    """Return a fresh copy of the local, versioned scoring configuration."""
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def detect_anomaly(
    current_count: int | float,
    independent_count: int,
    history: Sequence[int | float],
    config: Mapping | None = None,
) -> AnomalyResult:
    """Detect a cross-source attention spike against a 30-day median/MAD baseline."""
    payload = dict(config or default_config())
    settings = _settings(payload)
    history_days = int(settings["history_days"])
    values = [float(value) for value in history[-history_days:]]
    baseline = float(median(values)) if values else 0.0
    mad = float(median([abs(value - baseline) for value in values])) if values else 0.0
    scale = max(mad * float(settings["mad_scale"]), float(settings["zero_mad_floor"]))
    robust_z = max(0.0, (float(current_count) - baseline) / scale)
    has_independent_confirmation = int(independent_count) >= int(settings["minimum_independent_sources"])
    triggered = has_independent_confirmation and robust_z >= float(settings["robust_z_threshold"])
    raw_weight = min(1.0, robust_z / max(float(settings["robust_z_threshold"]), 1.0))
    ceiling = float(settings["nonofficial_weight_ceiling"])
    effective_weight = min(raw_weight, ceiling) if triggered else 0.0
    return AnomalyResult(
        triggered=triggered,
        validation_status="pending_official_validation",
        effective_weight=effective_weight,
        baseline_median=baseline,
        mad=mad,
        robust_z_score=robust_z,
        independent_source_count=int(independent_count),
        history_days=len(values),
        config_version=str(payload.get("version", "unknown")),
    )


def _settings(config: Mapping) -> Mapping:
    nested = config.get("anomaly") if isinstance(config.get("anomaly"), Mapping) else config
    return {
        "history_days": nested.get("history_days", 30),
        "minimum_independent_sources": nested.get("minimum_independent_sources", nested.get("min_independent_sources", 3)),
        "robust_z_threshold": nested.get("robust_z_threshold", 3.5),
        "mad_scale": nested.get("mad_scale", 1.4826),
        "zero_mad_floor": nested.get("zero_mad_floor", 1.0),
        "nonofficial_weight_ceiling": nested.get("nonofficial_weight_ceiling", nested.get("non_official_ceiling", 0.60)),
    }
