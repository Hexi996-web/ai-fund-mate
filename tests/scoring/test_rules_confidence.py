from scoring.rules import policy_score, product_supply_score
from scoring.confidence import calculate_confidence

def test_policy_requires_document_and_product_supply_is_inverse_crowding():
    assert policy_score([])["score"] is None
    assert policy_score([{"quality_status":"normal","source_name":"中国证监会"}])["score"] == 65
    assert product_supply_score(20)["score"] > product_supply_score(500)["score"]

def test_degraded_coverage_reduces_confidence():
    high=calculate_confidence(5,5,1.0,1.0,1.0)
    low=calculate_confidence(2,5,0.5,0.5,0.5)
    assert high["score"] == 100
    assert low["score"] < high["score"]
