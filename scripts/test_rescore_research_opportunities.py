from scripts.rescore_research_opportunities import enterprise_score, score_item


def test_opportunity_score_uses_40_40_20_weights():
    proof = {"id": "ai-agent", "validation": {"score": 80}, "attention": {"score": 60, "accelerationPercent": 0}, "capacity": {"score": 70}}
    evidence = {"id": "ai-agent", "structure": {"demandAssessment": {"score": 70}},
                "enterprise": {"revenueGrowthMedian": 0, "profitGrowthMedian": 0,
                               "positiveRevenueShare": 50, "positiveProfitShare": 50},
                "assets": {"top10SharePercent": 30, "marketHistory": []}}
    result = score_item(proof, evidence, {})
    assert enterprise_score(evidence["enterprise"]) == 50
    assert result["opportunityScore"] == 70
    assert result["rankingWeights"]["attentionCognition"] == .25
