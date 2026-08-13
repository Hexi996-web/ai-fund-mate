import re

import pytest

from fund_product_model import build_products, make_product_id, parse_share_identity


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

def share(code, name, fund_type="混合型"):
    return {
        "code": code,
        "name": name,
        "type": fund_type,
        "netValue": 1.0,
        "dailyChangePercent": 0.1,
    }


def test_groups_a_and_c_shares_and_selects_a_as_representative():
    products, audit = build_products([
        share("000002", "示例基金C"),
        share("000001", "示例基金A"),
    ])

    assert len(products) == 1
    assert products[0]["productName"] == "示例基金"
    assert products[0]["representativeCode"] == "000001"
    assert products[0]["shareCount"] == 2
    assert [item["shareClass"] for item in products[0]["shares"]] == ["A", "C"]
    assert audit["shareTotal"] == 2
    assert audit["productTotal"] == 1


def test_prefers_default_rmb_share_then_c_when_a_is_missing():
    products, _ = build_products([
        share("000003", "示例基金C"),
        share("000002", "示例基金"),
    ])

    assert products[0]["representativeCode"] == "000002"


def test_type_conflict_splits_group_into_low_confidence_products():
    products, audit = build_products([
        share("000001", "示例基金A", "混合型"),
        share("000002", "示例基金C", "债券型"),
    ])

    assert len(products) == 2
    assert {product["groupingConfidence"] for product in products} == {"low"}
    assert len(audit["conflicts"]) == 1
    assert {item["code"] for item in audit["lowConfidence"]} == {"000001", "000002"}


def test_duplicate_share_class_splits_group_and_each_code_appears_once():
    products, audit = build_products([
        share("000001", "示例基金A"),
        share("000002", "示例基金 A"),
    ])

    codes = [item["code"] for product in products for item in product["shares"]]
    assert len(products) == 2
    assert sorted(codes) == ["000001", "000002"]
    assert len(codes) == len(set(codes))
    assert all(product["shareCount"] == len(product["shares"]) for product in products)
    assert len(audit["conflicts"]) == 1
@pytest.mark.parametrize("name", ["华安黄金ETF", "示例指数LOF", "养老目标FOF", "海外股票QDII"])
def test_does_not_treat_fund_type_acronyms_as_share_classes(name):
    identity = parse_share_identity(name)
    assert identity.product_name == name
    assert identity.share_class == "DEFAULT"
    assert identity.rule == "no_share_suffix"
