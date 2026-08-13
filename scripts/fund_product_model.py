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
