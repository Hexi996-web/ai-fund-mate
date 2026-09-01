from scripts.update_attention_pool import THEMES
from scripts import update_three_layer_evidence as evidence
from scripts.update_three_layer_evidence import STRUCTURE_CONTRACTS, demand_assessment, merge_catalyst_history, number


def test_every_mother_pool_theme_has_a_structure_contract():
    theme_ids = {theme_id for theme_id, _query, _board in THEMES}
    assert len(theme_ids) == 36
    assert set(STRUCTURE_CONTRACTS) == theme_ids
    assert all(len(contract[1]) >= 3 for contract in STRUCTURE_CONTRACTS.values())


def test_invalid_market_values_do_not_break_a_theme_snapshot():
    assert number("-") == 0
    assert number(None) == 0
    assert number("123.4") == 123.4


def test_constituents_follow_every_result_page(monkeypatch):
    calls = []
    def fake_get(_url, params):
        calls.append(params["pn"])
        start = (params["pn"] - 1) * 100
        size = 100 if params["pn"] < 3 else 5
        return {"data": {"total": 205, "diff": [{"f12": str(start + index)} for index in range(size)]}}
    monkeypatch.setattr(evidence, "get_json", fake_get)
    rows = evidence.constituents("BK0000")
    assert calls == [1, 2, 3]
    assert len(rows) == 205


def test_catalyst_events_are_deduplicated_and_archived():
    event = {"date": "2026-08-20", "title": "获得项目批准", "sourceUrl": "https://example.test/a"}
    history = merge_catalyst_history({"catalystHistory": [event]}, {"catalysts": [event]})
    assert history == [event]


def test_missing_core_demand_data_stays_neutral_without_reweighting():
    result = demand_assessment(STRUCTURE_CONTRACTS["agri-tech"], {"history": []})
    assert result["score"] == 50
    assert result["label"] == "需求待验证"
    assert [row["baseWeightPercent"] for row in result["coreIndicators"]] == [45, 35, 20]


def test_single_supply_proxy_cannot_confirm_broad_demand():
    rows = [{"date": f"2025-{month:02d}", "value": 100} for month in range(1, 13)]
    rows += [{"date": f"2026-{month:02d}", "value": 200} for month in range(1, 13)]
    result = demand_assessment(STRUCTURE_CONTRACTS["agri-tech"], {
        "history": rows, "metric": "大型拖拉机月产量", "unit": "台",
        "source": "国家统计局口径／中商产业数据库公开页",
    })
    assert result["score"] < 58
    assert result["label"] == "需求待验证"
    assert result["observations"][0]["role"] == "辅助供给代理"
