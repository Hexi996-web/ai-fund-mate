import re

import pytest

from fund_product_model import make_product_id, parse_share_identity


@pytest.mark.parametrize(
    ("name", "product_name", "share_class", "confidence", "rule"),
    [
        ("示例基金A", "示例基金", "A", "high", "explicit_share_suffix"),
        ("示例基金 C", "示例基金", "C", "high", "explicit_share_suffix"),
        ("示例基金美元现汇", "示例基金", "USD_SPOT", "high", "currency_share_suffix"),
        ("示例基金美元现钞", "示例基金", "USD_CASH", "high", "currency_share_suffix"),
        ("示例基金人民币", "示例基金", "RMB", "high", "currency_share_suffix"),
        ("示例基金", "示例基金", "DEFAULT", "high", "no_share_suffix"),
    ],
)
def test_parse_share_identity(name, product_name, share_class, confidence, rule):
    identity = parse_share_identity(name)

    assert identity.product_name == product_name
    assert identity.share_class == share_class
    assert identity.confidence == confidence
    assert identity.rule == rule


@pytest.mark.parametrize(
    "name",
    [
        "示例ETF联接A",
        "示例发起式C",
        "示例三年持有期A",
        "示例一年定期开放C",
    ],
)
def test_preserves_economic_identity_words_when_removing_share_suffix(name):
    identity = parse_share_identity(name)

    assert identity.product_name in name
    assert identity.product_name.endswith(("ETF联接", "发起式", "三年持有期", "一年定期开放"))


def test_product_id_is_stable_versioned_and_type_sensitive():
    first = make_product_id("示例基金", "混合型")
    second = make_product_id("示例基金", "混合型")
    other_type = make_product_id("示例基金", "债券型")

    assert first == second
    assert first != other_type
    assert re.fullmatch(r"prd_[0-9a-f]{16}", first)
