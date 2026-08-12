def deduplicate_events(events):
    seen = set()
    result = []
    for event in events:
        key = (event.get("source"), event.get("status"), event.get("message"))
        if key not in seen:
            result.append(event)
            seen.add(key)
    return result


def build_coverage(indicators, observations, explicit_states=None):
    explicit_states = explicit_states or {}
    observed = {item["indicator_id"] for item in observations}
    return {
        indicator_id: "normal" if indicator_id in observed else explicit_states.get(indicator_id, "missing")
        for indicator_id in indicators
    }
