POLICY_INDICATORS = {
    "ai_semiconductor": "ai_semiconductor_policy",
    "dividend": "dividend_policy",
}


def build_complete_coverage(indicators, observations, documents, explicit_states):
    observed = {item["indicator_id"] for item in observations}
    policy = {
        POLICY_INDICATORS[item["theme"]]
        for item in documents
        if item.get("quality_status") in {"normal", "human_confirmed"} and item.get("theme") in POLICY_INDICATORS
    }
    return {
        indicator_id: "normal" if indicator_id in observed or indicator_id in policy else explicit_states.get(indicator_id, "missing")
        for indicator_id in indicators
    }
