from scripts.history.compact_public_history import compact_attention, compact_social


def test_public_history_keeps_small_resilient_fallbacks():
    social = compact_social({
        "snapshots": [{"capturedAt": "2026-08-30T01:00:00Z"}, {"capturedAt": "2026-08-31T01:00:00Z"}, {"capturedAt": "2026-08-31T03:00:00Z"}],
        "daily": [{"date": str(index)} for index in range(10)],
        "weekly": list(range(8)), "monthly": list(range(5)),
    })
    assert len(social["snapshots"]) == 2
    assert len(social["daily"]) == 7
    assert len(social["weekly"]) == 4
    assert len(social["monthly"]) == 2
    assert len(compact_attention({"rankingHistory": list(range(8))})["rankingHistory"]) == 2
