from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class SourceTier(str, Enum):
    OFFICIAL = "official"
    SELF_REGULATORY = "self_regulatory"
    INDUSTRY = "industry"
    MEDIA = "media"


class DemandKind(str, Enum):
    DIRECT = "direct"
    PROXY = "proxy"
    MEDIA_ATTENTION = "media_attention"
    UNKNOWN = "unknown"


class ValidationStatus(str, Enum):
    PENDING_OFFICIAL_VALIDATION = "pending_official_validation"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


@dataclass(frozen=True)
class SourceRecord:
    id: str
    name: str
    url: str
    source_tier: SourceTier
    enabled: bool = True
    description: str = ""


@dataclass(frozen=True)
class RawItem:
    source_id: str
    url: str
    title: str
    content_hash: str
    collected_at: datetime
    body: str = ""
    content_status: str = "available"
    content: str = ""
    published_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    id: int | None = None


@dataclass(frozen=True)
class EventCluster:
    id: str
    title: str
    category: str
    created_at: datetime
    updated_at: datetime
    summary: str = ""
    topic_key: str = ""
    item_count: int = 0
    independent_source_count: int = 0


@dataclass(frozen=True)
class SignalRecord:
    id: str
    cluster_id: str | None
    category: str
    title: str
    summary: str
    priority: int
    source_confidence: float
    customer_demand_score: float
    validation_status: ValidationStatus
    created_at: datetime
    updated_at: datetime
    demand_kind: DemandKind = DemandKind.UNKNOWN
    published_at: datetime | None = None


@dataclass(frozen=True)
class SignalEvidence:
    signal_id: str
    raw_item_id: int
    evidence_type: str
    excerpt: str
    source_confidence: float
    id: int | None = None


@dataclass(frozen=True)
class CatalystRecord:
    id: str
    signal_id: str | None
    title: str
    scheduled_at: datetime
    priority: int
    description: str = ""
    validation_status: ValidationStatus = ValidationStatus.PENDING_OFFICIAL_VALIDATION


@dataclass(frozen=True)
class DailyBrief:
    id: str
    window_start: datetime
    window_end: datetime
    generated_at: datetime
    body: str
    status: str = "published"
    signal_ids: tuple[str, ...] = ()
    top_call: str = ""


@dataclass(frozen=True)
class PipelineRun:
    id: str
    command: str
    started_at: datetime
    status: str
    summary: str
    finished_at: datetime | None = None
