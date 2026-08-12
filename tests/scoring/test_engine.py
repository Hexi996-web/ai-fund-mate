from scoring.engine import aggregate_score


def test_missing_evidence_is_null_and_not_neutral():
    result = aggregate_score({"policy": 70, "funds": None, "fundamental": None, "valuation": 40, "product_supply": None})
    assert result["availableEvidenceCount"] == 2
    assert result["status"] == "insufficient_data"
    assert result["score"] == 55.0


def test_three_evidence_types_unlock_research_status():
    result = aggregate_score({"policy": 70, "funds": 60, "fundamental": 50, "valuation": None, "product_supply": None})
    assert result["availableEvidenceCount"] == 3
    assert result["status"] == "neutral_tracking"
