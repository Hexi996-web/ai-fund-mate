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
        "todayOffering": 1, "upcomingOffering": 0, "todayEstablished": 1, "weekEstablished": 1,
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


def test_reported_scale_takes_priority_over_estimate():
    established = [{"基金代码": "1", "基金简称": "基金1", "成立日期": "2026-01-02"}]
    estimates = [{"基金代码": "1", "最近总份额": 100000000, "单位净值": 1, "更新日期": "2026-08-14"}]
    reported = {"000001": {"latestScaleYi": 8.8, "latestScaleDate": "2026-06-30", "latestScaleStatus": "天天基金最近一期披露"}}
    payload = build_payload(established, [], {"funds": []}, datetime(2026, 8, 17, tzinfo=timezone.utc), estimates, reported)
    fund = payload["rankings"]["ytd"][0]
    assert fund["latestScaleYi"] == 8.8
    assert fund["latestScaleStatus"] == "天天基金最近一期披露"


def test_adds_tiantian_market_metrics():
    established = [{"基金代码": "1", "基金简称": "基金1", "成立日期": "2026-01-02"}]
    market = [{"基金代码": "1", "日期": "2026-08-17", "单位净值": 1.2345, "日增长率": 0.5, "近1周": 1.2, "近1月": 2.3, "近3月": 4.5, "今年来": 8.9}]
    payload = build_payload(established, [], {"funds": []}, datetime(2026, 8, 17, tzinfo=timezone.utc), market_rows=market)
    fund = payload["rankings"]["ytd"][0]
    assert fund["unitNav"] == 1.2345
    assert fund["weekReturnPercent"] == 1.2
    assert fund["ytdReturnPercent"] == 8.9


def test_groups_share_classes_and_calculates_scale_growth_patterns():
    established = [
        {"基金代码": "1", "基金简称": "示例A", "基金类型": "混合型", "成立日期": "2026-01-02", "募集份额": 10},
        {"基金代码": "2", "基金简称": "示例C", "基金类型": "混合型", "成立日期": "2026-01-02", "募集份额": 10},
    ]
    active = {"funds": [
        {"code": "000001", "productId": "p1", "productName": "示例基金"},
        {"code": "000002", "productId": "p1", "productName": "示例基金"},
    ]}
    reported = {
        "000001": {"latestScaleYi": 8, "latestScaleDate": "2026-06-30"},
        "000002": {"latestScaleYi": 4, "latestScaleDate": "2026-06-30"},
    }
    payload = build_payload(established, [], active, datetime(2026, 8, 17, tzinfo=timezone.utc), reported_scales=reported)
    product = payload["scaleGrowth"]["products"][0]
    assert product["shareCount"] == 2
    assert product["initialScaleYi"] == 10
    assert product["latestScaleYi"] == 12
    assert product["scaleGrowthYi"] == 2
    assert product["scaleGrowthPercent"] == 20
    assert product["scaleHistory"] == [
        {"date": "2026-01-02", "scaleYi": 10, "shareCoverage": 2, "complete": True, "kind": "launch"}
    ]
    assert payload["scaleGrowth"]["increasedCount"] == 1
    assert payload["scaleGrowth"]["patterns"][0]["sampleCount"] == 1
    assert payload["scaleGrowth"]["quadrants"] == [
        {"key": "有历史×有效可比", "count": 0},
        {"key": "有历史×不可比", "count": 0},
        {"key": "无历史×有效可比", "count": 1},
        {"key": "无历史×不可比", "count": 0},
    ]
    assert [item["dimension"] for item in payload["scaleGrowth"]["dimensionAnalysis"]] == [
        "板块", "基金公司", "产品形态", "首发规模区间", "发行月份",
    ]
    company = payload["scaleGrowth"]["dimensionAnalysis"][1]
    assert company["summary"].startswith("共覆盖1个有效可比产品")
    assert company["groups"][0]["productIds"] == ["p1"]
    assert company["groups"][0]["medianProductIds"] == ["p1"]


def test_excludes_old_and_tiny_baseline_products_from_growth_rate_analysis():
    established = [
        {"基金代码": "1", "基金简称": "旧基金", "基金类型": "混合型", "成立日期": "2025-01-02", "募集份额": 10},
        {"基金代码": "2", "基金简称": "微型基金", "基金类型": "混合型", "成立日期": "2026-01-02", "募集份额": 0.1},
    ]
    reported = {"000002": {"latestScaleYi": 10, "latestScaleDate": "2026-06-30"}}
    payload = build_payload(established, [], {"funds": []}, datetime(2026, 8, 17, tzinfo=timezone.utc), reported_scales=reported)
    products = payload["scaleGrowth"]["products"]
    assert len(products) == 1
    assert products[0]["scaleGrowthStatus"] == "基数过小"
    assert products[0]["scaleGrowthPercent"] is None
    assert payload["scaleGrowth"]["comparableCount"] == 0


def test_aggregates_reported_history_and_selects_nearby_milestones():
    established = [
        {"基金代码": "1", "基金简称": "示例A", "成立日期": "2026-01-01", "募集份额": 10},
        {"基金代码": "2", "基金简称": "示例C", "成立日期": "2026-01-01", "募集份额": 10},
    ]
    active = {"funds": [
        {"code": "000001", "productId": "p1", "productName": "示例基金"},
        {"code": "000002", "productId": "p1", "productName": "示例基金"},
    ]}
    reported = {
        "000001": {"latestScaleYi": 9, "latestScaleDate": "2026-04-30", "scaleHistory": [{"date": "2026-02-28", "scaleYi": 8}, {"date": "2026-04-30", "scaleYi": 9}]},
        "000002": {"latestScaleYi": 5, "latestScaleDate": "2026-04-30", "scaleHistory": [{"date": "2026-02-28", "scaleYi": 4}, {"date": "2026-04-30", "scaleYi": 5}]},
    }
    payload = build_payload(established, [], active, datetime(2026, 8, 17, tzinfo=timezone.utc), reported_scales=reported)
    product = payload["scaleGrowth"]["products"][0]
    assert product["scaleHistory"][-1]["scaleYi"] == 14
    assert product["scaleHistory"][-1]["shareCoverage"] == 2
    assert product["d90"]["status"] == "observed"
    assert product["d90"]["observationAgeDays"] == 119
    assert product["d90"]["growthPercent"] == 40
    assert product["d30"]["status"] == "observed"
    assert product["d30"]["offsetDays"] == 28
    assert product["historyCovered"] is True
    assert product["effectiveComparable"] is True
    assert product["coverageQuadrant"] == "有历史×有效可比"


def test_requires_complete_same_date_share_coverage_for_comparison():
    established = [
        {"基金代码": "1", "基金简称": "示例A", "成立日期": "2026-01-01", "募集份额": 10},
        {"基金代码": "2", "基金简称": "示例C", "成立日期": "2026-01-01", "募集份额": 10},
    ]
    active = {"funds": [
        {"code": "000001", "productId": "p1", "productName": "示例基金"},
        {"code": "000002", "productId": "p1", "productName": "示例基金"},
    ]}
    reported = {
        "000001": {"latestScaleYi": 8, "latestScaleDate": "2026-06-30"},
        "000002": {"latestScaleYi": 4, "latestScaleDate": "2026-03-31"},
    }
    payload = build_payload(established, [], active, datetime(2026, 8, 17, tzinfo=timezone.utc), reported_scales=reported)
    product = payload["scaleGrowth"]["products"][0]
    assert product["latestScaleYi"] is None
    assert product["scaleGrowthStatus"] == "口径不完整"
    assert product["effectiveComparable"] is False
    assert product["coverageQuadrant"] == "无历史×不可比"


def test_builds_product_level_future_pipeline_and_separates_legacy_exit_baseline():
    offerings = [
        {"基金代码": "1", "基金名称": "未来基金A", "基金类型": "混合型", "管理人": "示例基金", "募集起始日": "2026-08-20", "募集终止日": "2026-08-30", "募集上限": 8},
        {"基金代码": "2", "基金名称": "未来基金C", "基金类型": "混合型", "管理人": "示例基金", "募集起始日": "2026-08-20", "募集终止日": "2026-08-30"},
        {"基金代码": "3", "基金名称": "在售基金", "基金类型": "债券型", "管理人": "示例基金", "募集起始日": "2026-08-10", "募集终止日": "2026-08-25"},
    ]
    risk = {"funds": [
        {"code": "9", "name": "历史基金A", "operationStatus": "suspected_terminated"},
        {"code": "10", "name": "今年终止基金", "operationStatus": "terminated", "firstObservedAt": "2026-07-01"},
    ]}
    payload = build_payload([], offerings, {"funds": []}, datetime(2026, 8, 17, tzinfo=timezone.utc), risk_payload=risk)
    assert payload["summary"]["upcomingOffering"] == 2
    assert payload["futureIssuance"]["totalCount"] == 2
    assert payload["futureIssuance"]["ongoingCount"] == 1
    assert payload["futureIssuance"]["upcomingCount"] == 1
    assert payload["futureIssuance"]["shareClassCount"] == 3
    assert payload["futureIssuance"]["products"][1]["shareCount"] == 2
    assert payload["futureIssuance"]["scaleDisclosureCount"] == 1
    assert payload["futureIssuance"]["disclosedPlannedScaleYi"] == 8
    assert payload["futureIssuance"]["scaleStructure"][1]["scaleSharePercent"] == 100
    assert payload["exitRisk"]["ytdConfirmedTerminated"] == 1
    assert payload["exitRisk"]["baselineProducts"] == 1
