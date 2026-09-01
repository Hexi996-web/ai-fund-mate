import unittest
from datetime import date, timedelta
from pathlib import Path

from update_active_funds import build_output_payloads, classify_fund, enrich_daily_scale, enrich_product_metrics, extract_last_net_value_date, infer_data_date
from store_fund_scale_snapshots import issuance_baseline_rows, product_scale_history_rows, snapshot_rows


class DailyScaleTests(unittest.TestCase):
    def test_estimates_scale_from_current_nav_and_latest_public_shares(self):
        funds = [{"code": "000001", "netValue": 1.25, "lastNetValueDate": "2026-08-18"}]
        rows = [{"基金代码": "000001", "最近总份额": 800_000_000, "单位净值": 0.9, "更新日期": "2026-08-01"}]
        result = enrich_daily_scale(funds, rows, date(2026, 8, 18))[0]
        self.assertEqual(result["scaleYi"], 10)
        self.assertEqual(result["totalSharesYi"], 8)
        self.assertEqual(result["scaleDate"], "2026-08-18")
        self.assertEqual(result["sharesDate"], "2026-08-01")
        self.assertEqual(result["scaleQuality"], "B")

    def test_marks_missing_nav_or_shares_as_unknown(self):
        result = enrich_daily_scale([{"code": "000002", "netValue": None}], [], date(2026, 8, 18))[0]
        self.assertIsNone(result["scaleYi"])
        self.assertEqual(result["scaleQuality"], "U")

    def test_uses_etf_total_market_value_without_requiring_open_fund_shares(self):
        funds = [{"code": "518880", "netValue": 9.1, "lastNetValueDate": "2026-08-20"}]
        rows = [{
            "基金代码": "518880", "最近总份额": 10_296_640_847,
            "更新日期": "2026-08-20", "直接估算规模亿元": 937.0,
            "规模估算口径": "ETF总市值估算",
        }]
        result = enrich_daily_scale(funds, rows, date(2026, 8, 20))[0]
        self.assertEqual(result["scaleYi"], 937.0)
        self.assertEqual(result["scaleStatus"], "ETF总市值估算")
        self.assertEqual(result["scaleQuality"], "A")

    def test_etf_snapshot_is_treated_as_active(self):
        status, _ = classify_fund(
            name="黄金ETF华安", purchase_status="场内交易", redemption_status=None,
            last_net_value_date=None, appears_active=True,
        )
        self.assertEqual(status, "active_snapshot")

    def test_builds_only_complete_database_snapshot_rows(self):
        rows = snapshot_rows({"funds": [
            {"code": "000001", "scaleDate": "2026-08-18", "scaleYi": 10, "scaleQuality": "B"},
            {"code": "000002", "scaleDate": None, "scaleYi": None},
        ]})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0:2], ("000001", "2026-08-18"))

    def test_builds_issuance_baseline_rows(self):
        rows = issuance_baseline_rows({"scaleGrowth": {"products": [{
            "productId": "p1", "code": "000001", "name": "示例产品",
            "establishedDate": "2026-01-01", "initialScaleYi": 10,
        }]}})
        self.assertEqual(rows[0][0:5], ("p1", "000001", "示例产品", "2026-01-01", 10))

    def test_builds_product_scale_history_rows(self):
        rows = product_scale_history_rows({"scaleGrowth": {"products": [{
            "productId": "p1", "scaleHistory": [
                {"date": "2026-01-01", "scaleYi": 10, "kind": "launch", "shareCoverage": 2},
                {"date": "2026-03-31", "scaleYi": 12, "shareCoverage": 2},
            ],
        }]}})
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][0:5], ("p1", "2026-03-31", 12, 2, "reported"))


class ClassifyFundTests(unittest.TestCase):
    def test_keeps_recent_fund_with_paused_purchase(self):
        result = classify_fund(
            name="测试基金",
            purchase_status="暂停申购",
            redemption_status="开放赎回",
            last_net_value_date=date.today() - timedelta(days=2),
            appears_active=False,
            stale_days=60,
        )
        self.assertEqual(result, ("active", None))

    def test_keeps_fund_in_closed_period_when_it_appears_active(self):
        result = classify_fund(
            name="封闭运作测试基金",
            purchase_status="封闭期",
            redemption_status="封闭期",
            last_net_value_date=None,
            appears_active=True,
            stale_days=60,
        )
        self.assertEqual(result, ("active_snapshot", None))

    def test_excludes_explicitly_terminated_fund(self):
        status, reason = classify_fund(
            name="测试基金",
            purchase_status="基金终止",
            redemption_status="终止赎回",
            last_net_value_date=date.today(),
            appears_active=True,
            stale_days=60,
        )
        self.assertEqual(status, "terminated")
        self.assertIn("终止", reason)

    def test_quarantines_stale_fund_missing_from_active_snapshots(self):
        status, reason = classify_fund(
            name="历史基金",
            purchase_status=None,
            redemption_status=None,
            last_net_value_date=date.today() - timedelta(days=90),
            appears_active=False,
            stale_days=60,
        )
        self.assertEqual(status, "suspected_terminated")
        self.assertIn("60", reason)


class ExtractLastNetValueDateTests(unittest.TestCase):
    def test_prefers_explicit_daily_snapshot_report_date(self):
        result = extract_last_net_value_date(
            {"净值日期": "2026-08-10"},
            {"报告时间": "2026-08-09"},
        )
        self.assertEqual(result, date(2026, 8, 10))

    def test_extracts_report_date_from_real_dynamic_daily_column(self):
        result = extract_last_net_value_date(
            {"2026-08-08单位净值": 1.2345, "2026-08-08日增长率": "0.5%"},
            {},
        )
        self.assertEqual(result, date(2026, 8, 8))


    def test_ignores_dated_dynamic_columns_without_real_observations(self):
        missing_values = (None, float("nan"), "", "---")
        for missing_value in missing_values:
            with self.subTest(missing_value=missing_value):
                result = extract_last_net_value_date(
                    {"2026-08-08单位净值": missing_value},
                    {"报告时间": "2026-08-07"},
                )
                self.assertEqual(result, date(2026, 8, 7))
                self.assertIsNone(extract_last_net_value_date(
                    {"2026-08-08单位净值": missing_value},
                    {},
                ))

    def test_treats_zero_as_a_real_dated_dynamic_observation(self):
        result = extract_last_net_value_date(
            {"2026-08-08万份收益": 0},
            {"报告时间": "2026-08-07"},
        )
        self.assertEqual(result, date(2026, 8, 8))
    def test_falls_back_to_purchase_row_report_date(self):

        result = extract_last_net_value_date(
            {},
            {"最新净值/万份收益-报告时间": "2026-08-07 00:00:00"},
        )
        self.assertEqual(result, date(2026, 8, 7))

    def test_keeps_date_null_when_no_real_report_date_exists(self):
        self.assertIsNone(extract_last_net_value_date(
            {"单位净值": 1.2345},
            {"申购状态": "开放申购"},
        ))


class ProductOutputPayloadTests(unittest.TestCase):
    def test_money_fund_does_not_treat_daily_income_as_nav_growth(self):
        product = {
            "productId": "money-1", "representativeCode": "000001", "type": "货币型-普通货币",
            "shares": [{"code": "000001", "netValue": 0.56, "lastNetValueDate": "2026-08-24", "scaleYi": 12}],
        }
        previous = [{
            "productId": "money-1", "metricsAsOf": "2026-08-23", "metricsCoverageStart": "2026-01-02",
            "ytdStartNav": 0.21, "ytdPeakNav": 0.60, "maxDrawdownPercent": -10,
            "baselineScaleYi": 10, "baselineScaleDate": "2025-12-31",
        }]
        result = enrich_product_metrics([product], previous, date(2026, 8, 24))[0]
        self.assertIsNone(result["navGrowthPercent"])
        self.assertIsNone(result["maxDrawdownPercent"])
        self.assertIsNone(result["ytdStartNav"])
        self.assertEqual(result["scaleNetIncreaseYi"], 2)

    def test_carries_daily_metrics_and_uses_launch_scale_for_a_new_fund(self):
        product = {
            "productId": "p1", "representativeCode": "000001",
            "shares": [{
                "code": "000001", "netValue": 1.2, "lastNetValueDate": "2026-08-20",
                "scaleYi": 12, "establishedDate": "2026-02-01", "initialScaleYi": 10,
            }],
        }
        result = enrich_product_metrics([product], [], date(2026, 8, 20))[0]
        self.assertEqual(result["baselineScaleType"], "成立规模")
        self.assertEqual(result["scaleNetIncreaseYi"], 2)
        self.assertEqual(result["scaleGrowthPercent"], 20)
        self.assertEqual(result["navGrowthPercent"], 0)
        self.assertEqual(result["baselineNavType"], "成立")
        self.assertEqual(result["baselineNavDate"], "2026-08-20")

    def test_updates_drawdown_and_preserves_year_baseline(self):
        current = {
            "productId": "p1", "representativeCode": "000001",
            "shares": [{"code": "000001", "netValue": 0.9, "lastNetValueDate": "2026-08-20", "scaleYi": 13}],
        }
        previous = [{
            "productId": "p1", "metricsAsOf": "2026-08-19", "metricsCoverageStart": "2026-01-02",
            "representativeNav": 1.1, "ytdStartNav": 1, "ytdPeakNav": 1.2,
            "maxDrawdownPercent": -8.3333, "drawdownStartDate": "2026-06-01", "drawdownEndDate": "2026-07-01",
            "baselineScaleYi": 10, "baselineScaleDate": "2025-12-31", "baselineScaleType": "去年年末规模",
        }]
        result = enrich_product_metrics([current], previous, date(2026, 8, 20))[0]
        self.assertEqual(result["scaleNetIncreaseYi"], 3)
        self.assertEqual(result["navGrowthPercent"], -10)
        self.assertEqual(result["baselineNavType"], "年初")
        self.assertEqual(result["baselineNavDate"], "2026-01-02")
        self.assertEqual(result["maxDrawdownPercent"], -25)
        self.assertEqual(result["metricsCoverage"], "全年")

    def test_builds_compatible_share_product_and_review_payloads(self):
        active = [
            {"code": "000001", "name": "示例基金A", "type": "混合型", "netValue": 1.0},
            {"code": "000002", "name": "示例基金C", "type": "混合型", "netValue": 1.1},
        ]
        payloads = build_output_payloads(active, [], "2026-08-13 19:00:00", data_date=date(2026, 8, 12))
        shares = payloads["funds_active.json"]
        products = payloads["fund_products.json"]
        review = payloads["funds_grouping_review.json"]
        self.assertEqual(shares["total"], 2)
        self.assertEqual(products["shareTotal"], 2)
        self.assertEqual(products["productTotal"], 1)
        self.assertEqual(products["dataDate"], "2026-08-12")
        self.assertEqual(products["updateTime"], "2026-08-13 19:00:00")
        self.assertEqual(review["shareTotal"], 2)
        self.assertEqual(products["products"][0]["shareCount"], 2)
        for fund in shares["funds"]:
            for field in ("productId", "productName", "shareClass", "groupingConfidence", "groupingRule"):
                self.assertIn(field, fund)
            self.assertIn("netValue", fund)

    def test_data_date_uses_dominant_market_observation_not_generation_day(self):
        funds = [
            {"lastNetValueDate": "2026-08-31"},
            {"lastNetValueDate": "2026-08-31"},
            {"lastNetValueDate": "2026-09-01"},
        ]
        self.assertEqual(infer_data_date(funds), date(2026, 8, 31))

    def test_workflow_validates_and_commits_product_outputs(self):
        workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/update-active-funds.yml").read_text(encoding="utf-8")
        self.assertIn("python -m pytest scripts/test_fund_product_model.py scripts/test_update_active_funds.py -q", workflow)
        self.assertIn("public/fund_products.json", workflow)
        self.assertIn("public/funds_grouping_review.json", workflow)
        self.assertIn("validate_published_freshness.py public/fund_products.json", workflow)

if __name__ == "__main__":
    unittest.main()
