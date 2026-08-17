from datetime import datetime, timezone

from update_issuance_insights import build_payload


def test_builds_product_level_rankings_and_current_suspensions():
    established = [
        {"基金代码": "1", "基金简称": "示例成长A", "成立日期": "2026-08-17", "募集份额": 10, "成立来涨幅": 2},
        {"基金代码": "2", "基金简称": "示例价值A", "成立日期": "2026-06-01", "募集份额": 20, "成立来涨幅": 1},
    ]
    offerings = [
        {"基金代码": "3", "基金名称": "示例发行基金", "募集起始日": "2026-08-16", "募集终止日": "2026-08-20"},
    ]
    active = {"funds": [
        {"code": "000004", "name": "示例限购A", "productId": "p1", "productName": "示例限购", "purchaseStatus": "暂停申购", "type": "混合型"},
        {"code": "000005", "name": "示例限购C", "productId": "p1", "productName": "示例限购", "purchaseStatus": "暂停申购", "type": "混合型"},
    ]}

    scales = [{"基金代码": "1", "最近总份额": 123456000, "单位净值": 1.2, "更新日期": "2026-08-14"}]
    payload = build_payload(established, offerings, active, datetime(2026, 8, 17, 8, tzinfo=timezone.utc), scales)

    assert payload["summary"] == {
        "todayOffering": 1, "todayEstablished": 1, "weekEstablished": 1,
        "quarterEstablished": 2, "ytdEstablished": 2, "currentSuspended": 1,
    }
    assert payload["rankings"]["today"][0]["code"] == "000001"
    assert payload["rankings"]["today"][0]["latestScaleYi"] == 1.4815
    assert payload["rankings"]["today"][0]["latestScaleDate"] == "2026-08-14"
    assert payload["suspensions"][0]["representativeCode"] == "000004"


def test_keeps_all_ranked_funds_in_snapshot():
    established = [
        {"基金代码": str(code), "基金简称": f"基金{code}", "成立日期": "2026-01-02", "募集份额": code}
        for code in range(1, 76)
    ]
    payload = build_payload(established, [], {"funds": []}, datetime(2026, 8, 17, tzinfo=timezone.utc))
    assert len(payload["rankings"]["ytd"]) == 75
