from scoring.generate import generate_scores
def test_generation_emits_five_traceable_theme_scores():
    result=generate_scores([],[],[],{"coverage":{}})
    assert result["schemaVersion"]==1
    assert len(result["themes"])==5
    assert all("evidence" in item and "confidence" in item for item in result["themes"])
