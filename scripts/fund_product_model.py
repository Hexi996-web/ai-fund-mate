from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class ShareIdentity:
    product_name: str
    share_class: str
    confidence: str
    rule: str


_CURRENCY_SUFFIXES = (
    ("美元现汇", "USD_SPOT"),
    ("美元现钞", "USD_CASH"),
    ("人民币", "RMB"),
)
_LETTER_SUFFIX = re.compile(r"^(?P<name>.+?)[\s（(]*?(?P<class>[A-Z])[）)]?$")


def _normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value)).strip()
    return re.sub(r"\s+", " ", text)


def parse_share_identity(name: str) -> ShareIdentity:
    normalized = _normalize_name(name)
    for suffix, share_class in _CURRENCY_SUFFIXES:
        if normalized.endswith(suffix) and len(normalized) > len(suffix):
            product_name = normalized[: -len(suffix)].rstrip(" (")
            return ShareIdentity(
                product_name, share_class, "high", "currency_share_suffix"
            )

    match = _LETTER_SUFFIX.fullmatch(normalized)
    if match:
        return ShareIdentity(
            match.group("name").rstrip(" ("),
            match.group("class"),
            "high",
            "explicit_share_suffix",
        )
    return ShareIdentity(normalized, "DEFAULT", "high", "no_share_suffix")


def make_product_id(product_name: str, fund_type: str) -> str:
    normalized_name = _normalize_name(product_name)
    normalized_type = _normalize_name(fund_type)
    digest = hashlib.sha256(
        f"v1|{normalized_name}|{normalized_type}".encode("utf-8")
    ).hexdigest()[:16]
    return f"prd_{digest}"
_REPRESENTATIVE_PRIORITY = {
    "A": 0,
    "DEFAULT": 1,
    "RMB": 1,
    "C": 2,
    "UNKNOWN": 4,
}


def _representative_key(share: dict) -> tuple[int, str]:
    share_class = share["shareClass"]
    priority = _REPRESENTATIVE_PRIORITY.get(share_class, 3)
    return priority, str(share["code"])


def _single_product(share: dict, *, confidence: str | None = None) -> dict:
    product_id = share["productId"]
    if confidence == "low":
        product_id = make_product_id(f"{share['productName']}|{share['code']}", share["type"])
        share = {**share, "productId": product_id, "groupingConfidence": "low"}
    return {
        "productId": product_id,
        "productName": share["productName"],
        "type": share["type"],
        "representativeCode": share["code"],
        "shareCount": 1,
        "groupingConfidence": confidence or share["groupingConfidence"],
        "shares": [share],
    }


def build_products(shares: list[dict]) -> tuple[list[dict], dict]:
    enhanced = []
    rule_counts: dict[str, int] = {}
    for original in shares:
        identity = parse_share_identity(original["name"])
        product_id = make_product_id(identity.product_name, original["type"])
        item = {
            **original,
            "productId": product_id,
            "productName": identity.product_name,
            "shareClass": identity.share_class,
            "groupingConfidence": identity.confidence,
            "groupingRule": identity.rule,
        }
        enhanced.append(item)
        rule_counts[identity.rule] = rule_counts.get(identity.rule, 0) + 1

    by_name: dict[str, list[dict]] = {}
    for item in enhanced:
        by_name.setdefault(item["productName"], []).append(item)

    products = []
    low_confidence = []
    conflicts = []
    for product_name, group in sorted(by_name.items()):
        fund_types = {item["type"] for item in group}
        share_classes = [item["shareClass"] for item in group]
        conflict_reasons = []
        if len(fund_types) > 1:
            conflict_reasons.append("fund_type_conflict")
        if len(share_classes) != len(set(share_classes)):
            conflict_reasons.append("duplicate_share_class")

        if conflict_reasons:
            conflicts.append({
                "productName": product_name,
                "codes": sorted(item["code"] for item in group),
                "reasons": conflict_reasons,
            })
            for item in sorted(group, key=lambda value: value["code"]):
                product = _single_product(item, confidence="low")
                products.append(product)
                low_confidence.append(product["shares"][0])
            continue

        ordered = sorted(group, key=_representative_key)
        representative = ordered[0]
        products.append({
            "productId": representative["productId"],
            "productName": product_name,
            "type": representative["type"],
            "representativeCode": representative["code"],
            "shareCount": len(ordered),
            "groupingConfidence": "high",
            "shares": ordered,
        })

    audit = {
        "shareTotal": len(enhanced),
        "productTotal": len(products),
        "groupingRate": 0 if not enhanced else round(1 - len(products) / len(enhanced), 6),
        "ruleCounts": rule_counts,
        "lowConfidence": low_confidence,
        "conflicts": conflicts,
    }
    return products, audit
