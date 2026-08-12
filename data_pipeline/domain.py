from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum


class Theme(str, Enum):
    GOLD = "gold"
    AI_SEMICONDUCTOR = "ai_semiconductor"
    DIVIDEND = "dividend"
    BOND = "bond"
    HONG_KONG_TECH = "hong_kong_tech"


class EvidenceType(str, Enum):
    POLICY = "policy"
    FUNDS = "funds"
    FUNDAMENTAL = "fundamental"
    VALUATION = "valuation"
    PRODUCT_SUPPLY = "product_supply"


class QualityStatus(str, Enum):
    NORMAL = "normal"
    STALE = "stale"
    MISSING = "missing"
    CONFLICT = "conflict"
    PARSE_FAILED = "parse_failed"
    SOURCE_UNAVAILABLE = "source_unavailable"
    HUMAN_CONFIRMED = "human_confirmed"


@dataclass(frozen=True)
class SourceSpec:
    id: str; name: str; url: str; authority_level: str; region: str; frequency: str
    timeout_seconds: int; max_retries: int; min_interval_seconds: float; enabled: bool


@dataclass(frozen=True)
class IndicatorSpec:
    id: str; theme: Theme; evidence_type: EvidenceType; name: str; unit: str; frequency: str
    primary_source: str; backup_sources: tuple[str, ...]; stale_after_hours: int
    validation: dict; is_estimate: bool


@dataclass(frozen=True)
class Observation:
    indicator_id: str; source_id: str; effective_date: date; collected_at: datetime
    numeric_value: float | None; text_value: str | None; unit: str; dimension_key: str
    quality_status: QualityStatus; source_name: str; source_url: str
    published_at: datetime | None; raw_snapshot_sha256: str; is_estimate: bool


@dataclass(frozen=True)
class RawSnapshot:
    source_id: str; collected_at: datetime; sha256: str; content_type: str; path: object


@dataclass(frozen=True)
class UpsertStats:
    inserted: int; updated: int
