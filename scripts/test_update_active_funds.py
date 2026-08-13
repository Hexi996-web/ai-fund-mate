import unittest
from datetime import date, timedelta
from pathlib import Path

from update_active_funds import build_output_payloads, classify_fund, extract_last_net_value_date


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
    def test_builds_compatible_share_product_and_review_payloads(self):
        active = [
            {"code": "000001", "name": "示例基金A", "type": "混合型", "netValue": 1.0},
            {"code": "000002", "name": "示例基金C", "type": "混合型", "netValue": 1.1},
        ]
        payloads = build_output_payloads(active, [], "2026-08-13 19:00:00")
        shares = payloads["funds_active.json"]
        products = payloads["fund_products.json"]
        review = payloads["funds_grouping_review.json"]
        self.assertEqual(shares["total"], 2)
        self.assertEqual(products["shareTotal"], 2)
        self.assertEqual(products["productTotal"], 1)
        self.assertEqual(review["shareTotal"], 2)
        self.assertEqual(products["products"][0]["shareCount"], 2)
        for fund in shares["funds"]:
            for field in ("productId", "productName", "shareClass", "groupingConfidence", "groupingRule"):
                self.assertIn(field, fund)
            self.assertIn("netValue", fund)

    def test_workflow_validates_and_commits_product_outputs(self):
        workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/update-active-funds.yml").read_text(encoding="utf-8")
        self.assertIn("python -m pytest scripts/test_fund_product_model.py scripts/test_update_active_funds.py -q", workflow)
        self.assertIn("public/fund_products.json", workflow)
        self.assertIn("public/funds_grouping_review.json", workflow)

if __name__ == "__main__":
    unittest.main()
