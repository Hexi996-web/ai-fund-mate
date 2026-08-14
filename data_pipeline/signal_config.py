"""Validation and loading for versioned signal-analytics configuration."""

from __future__ import annotations

import copy
import hashlib
import json
import math
from collections.abc import Mapping
from pathlib import Path
from typing import Any


_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "signal_scoring.json"
_WEIGHT_KEYS = frozenset({"source", "evidence", "recency", "customer_demand", "topic_momentum", "impact"})
_DEMAND_KEYS = frozenset({"customer_real", "customer_proxy", "media_attention", "neutral_floor"})
_SCORING_KEYS = frozenset({"weights", "customer_demand", "recency_half_life_days", "independent_source_reference", "category_impact", "default_impact"})
_ANOMALY_KEYS = frozenset({"history_days", "minimum_history_days", "minimum_independent_sources", "robust_z_threshold", "mad_scale", "zero_mad_floor", "nonofficial_weight_ceiling"})


def default_config() -> dict[str, Any]:
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def resolve_config(config: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return a complete, valid, versioned config; custom configs never default."""
    payload = default_config() if config is None else copy.deepcopy(config)
    if not isinstance(payload, Mapping):
        raise ValueError("signal scoring config must be a mapping")
    payload = dict(payload)
    _validate_config(payload)
    return payload


def configuration_fingerprint(config: Mapping[str, Any]) -> str:
    """Hash the complete validated configuration in canonical JSON form."""
    payload = resolve_config(config)
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

def nonnegative_number(value: Any, name: str, *, integer: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be a finite non-negative number")
    if integer and int(value) != value:
        raise ValueError(f"{name} must be a whole number")
    return float(value)


def component_score(value: Any, name: str) -> float:
    number = nonnegative_number(value, name)
    if number > 1:
        raise ValueError(f"{name} must be within [0, 1]")
    return number


def positive_number(value: Any, name: str, *, integer: bool = False) -> float:
    number = nonnegative_number(value, name, integer=integer)
    if number == 0:
        raise ValueError(f"{name} must be positive")
    return number


def _validate_config(config: Mapping[str, Any]) -> None:
    version = config.get("version")
    if not isinstance(version, str) or not version.strip():
        raise ValueError("signal scoring config version is required")
    scoring = _mapping(config, "scoring")
    anomaly = _mapping(config, "anomaly")
    _require_keys(scoring, _SCORING_KEYS, "scoring")
    _require_keys(anomaly, _ANOMALY_KEYS, "anomaly")

    weights = _mapping(scoring, "weights")
    _require_keys(weights, _WEIGHT_KEYS, "scoring.weights")
    for key in _WEIGHT_KEYS:
        nonnegative_number(weights[key], f"scoring.weights.{key}")

    demand = _mapping(scoring, "customer_demand")
    _require_keys(demand, _DEMAND_KEYS, "scoring.customer_demand")
    for key in _DEMAND_KEYS:
        component_score(demand[key], f"scoring.customer_demand.{key}")

    positive_number(scoring["recency_half_life_days"], "scoring.recency_half_life_days")
    positive_number(scoring["independent_source_reference"], "scoring.independent_source_reference")
    component_score(scoring["default_impact"], "scoring.default_impact")
    impact = _mapping(scoring, "category_impact")
    if not impact:
        raise ValueError("scoring.category_impact must not be empty")
    for key, value in impact.items():
        if not isinstance(key, str) or not key:
            raise ValueError("scoring.category_impact keys must be non-empty strings")
        component_score(value, f"scoring.category_impact.{key}")

    history_days = positive_number(anomaly["history_days"], "anomaly.history_days", integer=True)
    minimum_history = positive_number(anomaly["minimum_history_days"], "anomaly.minimum_history_days", integer=True)
    if minimum_history > history_days:
        raise ValueError("anomaly.minimum_history_days cannot exceed anomaly.history_days")
    nonnegative_number(anomaly["minimum_independent_sources"], "anomaly.minimum_independent_sources", integer=True)
    positive_number(anomaly["robust_z_threshold"], "anomaly.robust_z_threshold")
    positive_number(anomaly["mad_scale"], "anomaly.mad_scale")
    positive_number(anomaly["zero_mad_floor"], "anomaly.zero_mad_floor")
    component_score(anomaly["nonofficial_weight_ceiling"], "anomaly.nonofficial_weight_ceiling")


def _mapping(container: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    value = container.get(name)
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be a mapping")
    return value


def _require_keys(container: Mapping[str, Any], required: frozenset[str], name: str) -> None:
    missing = sorted(required - container.keys())
    if missing:
        raise ValueError(f"{name} is missing required keys: {', '.join(missing)}")
