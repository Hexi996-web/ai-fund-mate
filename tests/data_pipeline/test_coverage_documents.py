from data_pipeline.coverage import build_complete_coverage


def test_policy_documents_satisfy_policy_indicators_and_unknown_sources_degrade():
    indicators = {"ai_semiconductor_policy": object(), "semiconductor_index": object()}
    documents = [{"theme": "ai_semiconductor", "quality_status": "normal"}]
    result = build_complete_coverage(indicators, [], documents, {"semiconductor_index": "source_unavailable"})
    assert result == {"ai_semiconductor_policy": "normal", "semiconductor_index": "source_unavailable"}
