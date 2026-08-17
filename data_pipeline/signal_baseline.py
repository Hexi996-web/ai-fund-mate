"""Shared robust median/MAD baseline used by scoring and anomaly detection."""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Sequence

from .signal_config import nonnegative_number, positive_number


@dataclass(frozen=True)
class RobustBaseline:
    values: tuple[float, ...]
    median: float
    mad: float
    scale: float


def robust_baseline(
    history: Sequence[int | float], *, history_days: int | float, mad_scale: float, zero_mad_floor: float,
) -> RobustBaseline:
    window = int(positive_number(history_days, "history_days", integer=True))
    scale_multiplier = positive_number(mad_scale, "mad_scale")
    floor = positive_number(zero_mad_floor, "zero_mad_floor")
    values = tuple(nonnegative_number(value, f"history[{index}]") for index, value in enumerate(history[-window:]))
    baseline = float(median(values)) if values else 0.0
    mad = float(median([abs(value - baseline) for value in values])) if values else 0.0
    return RobustBaseline(values=values, median=baseline, mad=mad, scale=max(mad * scale_multiplier, floor))
