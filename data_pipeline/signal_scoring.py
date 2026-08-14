"""Transparent, configuration-versioned signal prioritisation."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from .signal_baseline import robust_baseline
from .signal_config import component_score, default_config, nonnegative_number, resolve_config


@dataclass(frozen=True)
class ScoreBreakdown:
    """The six persisted, inspectable components that determine priority."""

    source_score: float
    evidence_score: float
    recency_score: float
    customer_demand_score: float | None
    topic_momentum_score: float
    impact_score: float
    priority: float
    config_version: str

    @property
    def components(self) -> dict[str, float | None]:
        return {
            "source": self.source_score,
            "evidence": self.evidence_score,
            "recency": self.recency_score,
            "customer_demand": self.customer_demand_score,
            "topic_momentum": self.topic_momentum_score,
            "impact": self.impact_score,
        }


def score_signal(
    source: Any,
    cluster: Any,
    draft: Any,
    prior_topic_counts: Sequence[int | float],
    as_of: datetime,
    config: Mapping | None = None,
    demand_kind: str | None = None,
) -> ScoreBreakdown:
    """Score a cluster using only stored components and a versioned configuration."""
    if not isinstance(as_of, datetime):
        raise ValueError("as_of must be a datetime")
    payload = resolve_config(config)
    settings = payload["scoring"]
    baseline_settings = payload["anomaly"]
    source_score = component_score(_value(source, "base_weight", 0.0), "source.base_weight")
    independent_count = nonnegative_number(_value(cluster, "independent_source_count", 0), "cluster.independent_source_count")
    evidence_score = min(1.0, independent_count / float(settings["independent_source_reference"]))
    recency_score = _recency_score(_value(cluster, "updated_at", as_of), as_of, float(settings["recency_half_life_days"]))
    kind = demand_kind if demand_kind is not None else _value(draft, "demand_kind", "unknown")
    customer_score = _customer_score(kind, settings["customer_demand"])
    momentum_score = _momentum_score(
        _value(cluster, "item_count", 0), prior_topic_counts, baseline_settings,
    )
    impact_score = component_score(
        settings["category_impact"].get(_value(draft, "category", ""), settings["default_impact"]),
        "impact_score",
    )
    priority_components = {
        "source": source_score,
        "evidence": evidence_score,
        "recency": recency_score,
        "customer_demand": settings["customer_demand"]["neutral_floor"] if customer_score is None else customer_score,
        "topic_momentum": momentum_score,
        "impact": impact_score,
    }
    priority = round(100 * sum(float(settings["weights"][name]) * value for name, value in priority_components.items()), 4)
    return ScoreBreakdown(
        source_score=source_score,
        evidence_score=evidence_score,
        recency_score=recency_score,
        customer_demand_score=customer_score,
        topic_momentum_score=momentum_score,
        impact_score=impact_score,
        priority=priority,
        config_version=payload["version"],
    )


def _value(subject: Any, name: str, default: Any) -> Any:
    return subject.get(name, default) if isinstance(subject, Mapping) else getattr(subject, name, default)


def _customer_score(demand_kind: str | None, tiers: Mapping[str, Any]) -> float | None:
    aliases = {"direct": "customer_real", "proxy": "customer_proxy"}
    key = aliases.get((demand_kind or "unknown").casefold(), (demand_kind or "unknown").casefold())
    return component_score(tiers[key], f"customer_demand.{key}") if key in tiers else None


def _recency_score(updated_at: datetime, as_of: datetime, half_life_days: float) -> float:
    if not isinstance(updated_at, datetime):
        raise ValueError("cluster.updated_at must be a datetime")
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (as_of - updated_at).total_seconds() / 86_400)
    return math.pow(.5, age_days / half_life_days)


def _momentum_score(current_count: int | float, history: Sequence[int | float], settings: Mapping[str, Any]) -> float:
    current = nonnegative_number(current_count, "cluster.item_count")
    baseline = robust_baseline(
        history,
        history_days=settings["history_days"],
        mad_scale=settings["mad_scale"],
        zero_mad_floor=settings["zero_mad_floor"],
    )
    if not baseline.values:
        return .5
    return min(1.0, max(0.0, .5 + (current - baseline.median) / (6 * baseline.scale)))