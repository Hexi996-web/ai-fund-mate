import json
from datetime import datetime, timedelta

from scripts.update_attention_pool import (
    parse_baidu_hotlist_html,
    parse_toutiao_hotlist,
    social_attention,
)


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
    assert resonance["score"] > quiet["score"]
    assert quiet["statusLabel"] == "未破圈"

