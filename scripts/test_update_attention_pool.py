import json
from datetime import datetime, timedelta

from scripts import update_attention_pool as attention_pool
from scripts.update_attention_pool import (
    atomic_write_json,
    parse_baidu_hotlist_html,
    parse_toutiao_hotlist,
    rescore_product_validations,
    social_attention,
    update_ranking_history,
    update_attention_history,
)


def test_atomic_write_json_replaces_complete_document(tmp_path):
    target = tmp_path / "snapshot.json"
    target.write_text('{"old":true}', encoding="utf-8")
    atomic_write_json(target, {"new": True, "items": [1, 2]})
    assert json.loads(target.read_text(encoding="utf-8")) == {"new": True, "items": [1, 2]}
    assert not target.with_suffix(".json.tmp").exists()


def test_parses_public_hot_lists():
    state = {"data": {"cards": [{"component": "hotList", "content": [
        {"word": "具身智能机器人进入工厂", "desc": "人形机器人规模化应用", "hotScore": "7654321"}
    ]}]}}
    html = f"<body><!--s-data:{json.dumps(state, ensure_ascii=False)}--></body>"
    baidu = parse_baidu_hotlist_html(html)
    toutiao = parse_toutiao_hotlist({"data": [
        {"Title": "宇树人形机器人发布新品", "LabelDesc": "具身智能", "HotValue": 123456}
    ]})
    assert baidu[0] == {"title": "具身智能机器人进入工厂", "description": "人形机器人规模化应用", "rank": 1, "heat": 7654321.0}
    assert toutiao[0]["title"] == "宇树人形机器人发布新品"
    assert toutiao[0]["heat"] == 123456.0


def test_cross_platform_resonance_scores_above_no_breakout():
    now = datetime.now().astimezone()
    matching = {"title": "具身智能与人形机器人加速落地", "description": "", "rank": 5, "heat": 1_000_000}
    unrelated = {"title": "普通社会新闻", "description": "", "rank": 1, "heat": 2_000_000}
    history = {"snapshots": [
        {"capturedAt": (now - timedelta(days=offset)).isoformat(), "sources": {
            "baidu": [matching], "toutiao": [matching],
        }} for offset in (0, 1, 2)
    ]}
    resonance = social_attention("embodied-ai", history)
    quiet = social_attention("space", {"snapshots": [
        {"capturedAt": now.isoformat(), "sources": {"baidu": [unrelated], "toutiao": [unrelated]}}
    ]})
    assert resonance["statusLabel"] == "社会共振"
    assert resonance["crossPlatformHits7d"] == 3
    assert resonance["activeDays7d"] == 3
    assert resonance["activeDays30d"] == 3
    assert resonance["recent30Appearances"] == 6
    assert resonance["score"] > quiet["score"]
    assert quiet["statusLabel"] == "未破圈"
    assert quiet["score"] == 0


def test_product_validation_score_rewards_absolute_demand_and_breadth():
    items = [
        {"validation": {"estimatedNetFlowYi": 120, "scaleNetIncreaseYi": 150, "scaleGrowthPercent": 20,
                        "growthBreadthPercent": 80, "top1SharePercent": 30, "effectiveFunds": 8,
                        "currentScaleYi": 600, "launched12Months": 4}},
        {"validation": {"estimatedNetFlowYi": 0.5, "scaleNetIncreaseYi": 1, "scaleGrowthPercent": 100,
                        "growthBreadthPercent": 10, "top1SharePercent": 95, "effectiveFunds": 1,
                        "currentScaleYi": 2, "launched12Months": 1}},
    ]
    rescore_product_validations(items)
    broad, tiny = (item["validation"] for item in items)
    assert broad["score"] > tiny["score"]
    assert broad["scoreComponents"]["absoluteScaleIncrease"] > tiny["scoreComponents"]["absoluteScaleIncrease"]
    assert "净流入代理25%" in broad["scoreMethod"]


def test_weekly_and_monthly_rollups_remain_archived(monkeypatch, tmp_path):
    old = {"schemaVersion": 2, "snapshots": [], "daily": [],
           "weekly": [{"period": "2020-W01", "activeDays": 3, "themes": {}}],
           "monthly": [{"period": "2020-01", "activeDays": 9, "themes": {}}]}
    monkeypatch.setattr(attention_pool, "load_attention_history", lambda: old)
    monkeypatch.setattr(attention_pool, "ATTENTION_HISTORY", tmp_path / "history.json")
    result = update_attention_history({"capturedAt": datetime.now().astimezone().isoformat(), "sources": {}})
    assert result["weekly"][0]["period"] == "2020-W01"
    assert result["monthly"][0]["period"] == "2020-01"


def test_ranking_history_replaces_same_day_and_is_bounded():
    old = [{"date": f"2024-01-{(day % 28) + 1:02d}-{day}", "recommendedIds": []} for day in range(1100)]
    old.append({"date": "2026-08-26", "recommendedIds": ["old"]})
    retained = update_ranking_history({"rankingHistory": old}, ["ai-agent"], ["ai-agent"], "2026-08-26", "2026-Q3")
    assert len(retained) == 1095
    assert retained[-1]["recommendedIds"] == ["ai-agent"]
    assert sum(row["date"] == "2026-08-26" for row in retained) == 1

