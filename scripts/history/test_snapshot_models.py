import unittest
from datetime import date
from decimal import Decimal
from scripts.history.snapshot_models import infer_snapshot_date, product_metric_rows, share_rows, theme_signal_rows


class SnapshotModelTests(unittest.TestCase):
    def test_date_and_leading_zeroes(self):
        self.assertEqual(infer_snapshot_date("funds", {"updateTime": "2026-08-31 07:12:19"}), date(2026, 8, 31))
        self.assertEqual(share_rows({"funds": [{"code": "1", "name": "测试"}]}, date(2026, 8, 31))[0][0], "000001")

    def test_metric_version_is_preserved(self):
        row = product_metric_rows({"groupingVersion": "v4", "products": [{"productId": "p", "currentScaleYi": 12.34}]}, date(2026, 8, 31), 1)[0]
        self.assertEqual((row[4], row[15]), (Decimal("12.34"), "v4"))

    def test_theme_score_is_versioned_and_ranked(self):
        row = theme_signal_rows({"methodologyVersion": "v2", "recommendedIds": ["ai"], "items": [{"id": "ai", "attention": {"score": 40}, "validation": {"score": 80}, "capacity": {"score": 90}}]}, date(2026, 8, 31), 1)[0]
        self.assertEqual((row[2], row[6], row[7]), ("v2", Decimal("70"), 1))


if __name__ == "__main__": unittest.main()
