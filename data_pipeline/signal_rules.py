"""Configuration-driven extraction of actionable signal drafts."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .signal_domain import EventCluster


@dataclass(frozen=True)
class SignalDraft:
    category: str
    direction: str
    horizon: str
    assets: list[str]
    fund_keywords: list[str]
    themes: list[str]
    fact: str
    transmission: str
    demand_kind: str = "unknown"


def load_signal_rules(path) -> dict:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload.get("rules"), list):
        raise ValueError("signal rules must contain a rules list")
    return payload


def classify_cluster(cluster: EventCluster, rules: dict) -> SignalDraft | None:
    text = _cluster_text(cluster).casefold()
    for rule in rules["rules"]:
        if _matches(rule, text):
            return SignalDraft(category=rule["category"], direction=rule["direction"], horizon=rule["horizon"], assets=list(rule["assets"]), fund_keywords=list(rule["fund_keywords"]), themes=list(rule["themes"]), fact=cluster.title, transmission=rule["transmission"], demand_kind=rule.get("demand_kind", "unknown"))
    return None


def _cluster_text(cluster: EventCluster) -> str:
    return "\n".join(f"{item.title}\n{item.body or item.content}" for item in cluster.raw_items) if cluster.raw_items else f"{cluster.title}\n{cluster.summary}"


def _matches(rule: dict, text: str) -> bool:
    match_all = [term.casefold() for term in rule.get("match_all", [])]
    match_any = [term.casefold() for term in rule.get("match_any", [])]
    required = [term.casefold() for term in rule.get("requires_any", [])]
    return all(term in text for term in match_all) and (not match_any or any(term in text for term in match_any)) and (not required or any(term in text for term in required))
