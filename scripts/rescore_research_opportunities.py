"""Combine demand, product-market, enterprise, attention and capacity evidence."""
from __future__ import annotations

import json
import math
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ATTENTION = ROOT / "public" / "attention_pool_evidence.json"
EVIDENCE = ROOT / "public" / "pre_research_evidence.json"
EXTERNAL = ROOT / "public" / "theme_external_signals.json"
MODEL_VERSION = "opportunity-demand-attention-v2"

TECH = {"ai-agent", "embodied-ai", "hard-tech", "future-tech", "industrial-software", "ai-application", "cybersecurity", "autonomous-driving", "service-robot"}
HEALTH = {"biotech", "synthetic-biology", "smart-healthcare", "digital-health", "mental-health", "obesity-care", "longevity"}
CONSUMER = {"experience", "pet-economy", "sports-outdoor", "inbound-consumption", "new-food", "creator-economy", "wealth-longevity", "human-upskilling"}
INFRASTRUCTURE = {"power", "resources", "nuclear-energy", "water-security", "climate-adaptation", "recycling", "grid-storage", "agri-tech", "space", "low-altitude", "defense-tech", "ocean-economy"}


def clamp(value):
    return min(100.0, max(0.0, float(value)))


def wiki_score(signal):
    rows = (signal or {}).get("wikimedia", {}).get("daily", [])
    if len(rows) < 90:
        return None
    def average(values):
        return sum(float(row.get("views") or 0) for row in values) / max(1, len(values))
    recent30, prior30 = average(rows[-30:]), average(rows[-60:-30])
    recent45, prior45 = average(rows[-45:]), average(rows[-90:-45])
    change30 = (recent30 / prior30 - 1) * 100 if prior30 else 0
    change90 = (recent45 / prior45 - 1) * 100 if prior45 else 0
    return clamp(50 + 25 * math.tanh(change30 / 35) + 25 * math.tanh(change90 / 45))


def enterprise_score(enterprise):
    revenue, profit = enterprise.get("revenueGrowthMedian"), enterprise.get("profitGrowthMedian")
    revenue_score = 50 if revenue is None else 50 + 50 * math.tanh(float(revenue) / 30)
    profit_score = 50 if profit is None else 50 + 50 * math.tanh(float(profit) / 35)
    breadth_values = [enterprise.get("positiveRevenueShare"), enterprise.get("positiveProfitShare")]
    breadth = sum(float(x) for x in breadth_values if x is not None) / max(1, sum(x is not None for x in breadth_values))
    return round(clamp(revenue_score * .4 + profit_score * .35 + breadth * .25), 1)


def max_drawdown(rows):
    peak, worst = None, 0.0
    for row in rows or []:
        value = row.get("close")
        if not isinstance(value, (int, float)):
            continue
        peak = value if peak is None else max(peak, value)
        if peak:
            worst = min(worst, (value / peak - 1) * 100)
    return worst


def differentiated_attention(theme_id, raw, long_term):
    """70% common comparable core plus a 30% sector layer.

    Sources that are planned but not yet legally connected stay at neutral 50;
    their weights are never redistributed to the currently available sources.
    """
    wiki = 50 if long_term is None else long_term
    common = raw * .60 + wiki * .10
    if theme_id in TECH:
        sector, profile = 50 * .15 + 50 * .10 + raw * .05, "technology-professional"
    elif theme_id in HEALTH:
        sector, profile = 50 * .15 + wiki * .10 + raw * .05, "health-research"
    elif theme_id in CONSUMER:
        sector, profile = 50 * .15 + raw * .10 + wiki * .05, "consumer-decision"
    elif theme_id in INFRASTRUCTURE:
        sector, profile = 50 * .15 + wiki * .10 + 50 * .05, "policy-global"
    else:
        sector, profile = 50 * .20 + raw * .05 + wiki * .05, "balanced"
    return clamp(common + sector), profile


def score_item(proof, evidence, external):
    demand = float(evidence.get("structure", {}).get("demandAssessment", {}).get("score") or 50)
    product = float(proof.get("validation", {}).get("score") or 50)
    enterprise = enterprise_score(evidence.get("enterprise") or {})
    raw_attention = float(proof.get("attention", {}).get("score") or 50)
    long_attention = wiki_score(external)
    attention, sector_profile = differentiated_attention(proof.get("id") or evidence.get("id"), raw_attention, long_attention)
    capacity = float(proof.get("capacity", {}).get("score") or 50)
    assets = evidence.get("assets") or {}
    drawdown = abs(max_drawdown(assets.get("marketHistory")))
    concentration = max(0, float(assets.get("top10SharePercent") or 0) - 30) / 70 * 100
    acceleration = max(0, float(proof.get("attention", {}).get("accelerationPercent") or 0) - 50) / 150 * 100
    risk_penalty = clamp(drawdown * 3 * .5 + concentration * .3 + acceleration * .2)
    risk_resilience = 100 - risk_penalty
    opportunity = demand * .4 + product * .4 + enterprise * .2
    total = demand * .2 + product * .2 + enterprise * .1 + attention * .25 + capacity * .2 + risk_resilience * .05
    return {
        "modelVersion": MODEL_VERSION,
        "opportunityScore": round(clamp(opportunity), 1),
        "attentionScore": round(clamp(attention), 1),
        "totalScore": round(clamp(total), 1),
        "riskPenalty": round(risk_penalty, 1),
        "attentionMethod": "统一基础信号70%＋产业差异信号30%；未接入来源按50分中性处理，不重分配权重。",
        "sectorProfile": sector_profile,
        "components": {"industryDemand": round(demand, 1), "productMarket": round(product, 1),
                       "enterpriseDelivery": enterprise, "attentionCognition": round(attention, 1),
                       "assetCapacity": round(capacity, 1), "riskResilience": round(risk_resilience, 1)},
        "opportunityWeights": {"industryDemand": .4, "productMarket": .4, "enterpriseDelivery": .2},
        "rankingWeights": {"industryDemand": .2, "productMarket": .2, "enterpriseDelivery": .1,
                           "attentionCognition": .25, "assetCapacity": .2, "riskResilience": .05},
    }


def main():
    attention = json.loads(ATTENTION.read_text(encoding="utf-8"))
    evidence = {x["id"]: x for x in json.loads(EVIDENCE.read_text(encoding="utf-8")).get("items", [])}
    external = {x["id"]: x for x in json.loads(EXTERNAL.read_text(encoding="utf-8")).get("items", [])}
    for item in attention.get("items", []):
        if item.get("id") in evidence:
            item["opportunityModel"] = score_item(item, evidence[item["id"]], external.get(item["id"], {}))
    ranked = sorted((x for x in attention.get("items", []) if x.get("opportunityModel")),
                    key=lambda x: x["opportunityModel"]["totalScore"], reverse=True)
    quarter = f"{date.today().year}-Q{(date.today().month - 1) // 3 + 1}"
    previous_version = attention.get("opportunityModelVersion")
    if previous_version != MODEL_VERSION or attention.get("recommendationReviewQuarter") != quarter:
        attention["recommendedIds"] = [x["id"] for x in ranked[:10]]
        attention["recommendationReviewQuarter"] = quarter
    attention["opportunityModelVersion"] = MODEL_VERSION
    attention["opportunityModelUpdatedAt"] = datetime.now().astimezone().isoformat()
    attention["opportunityRanking"] = [x["id"] for x in ranked]
    ATTENTION.write_text(json.dumps(attention, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"rescored {len(ranked)} research opportunities")


if __name__ == "__main__":
    main()
