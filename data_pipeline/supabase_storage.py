"""PostgreSQL repository for server-side Supabase pipeline jobs.

The optional PostgreSQL driver is imported only when a connection is opened,
so deterministic SQLite and fixture workflows have no extra dependency.
"""

from __future__ import annotations

import importlib
import json
import os
from datetime import datetime, timezone

from .signal_domain import (
    CatalystRecord,
    DailyBrief,
    DemandKind,
    EventCluster,
    PipelineRun,
    RawItem,
    SignalEvidence,
    SignalRecord,
    SourceRecord,
    SourceTier,
    ValidationStatus,
)


class SupabaseSignalRepository:
    """DB-API repository backed by a server-only Supabase PostgreSQL URL."""

    def __init__(self, db_url: str | None = None):
        self.db_url = db_url or os.environ.get("SUPABASE_DB_URL")
        if not self.db_url:
            raise RuntimeError("SUPABASE_DB_URL is required for PostgreSQL storage")

    def _connect(self):
        try:
            psycopg = importlib.import_module("psycopg")
            psycopg_rows = importlib.import_module("psycopg.rows")
        except ModuleNotFoundError as error:
            raise RuntimeError(
                "PostgreSQL storage requires the optional dependency psycopg[binary]; "
                "install it only in the server/automation environment"
            ) from error
        return psycopg.connect(self.db_url, row_factory=psycopg_rows.dict_row)

    def initialize(self):
        with self._connect() as connection:
            row = connection.execute("SELECT to_regclass('public.sources') AS relation").fetchone()
        if not row or row["relation"] is None:
            raise RuntimeError("Supabase signal schema is missing; apply the signal-intelligence migration first")

    def upsert_source(self, source: SourceRecord) -> SourceRecord:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO sources
                (id, name, url, source_tier, enabled, description, official, base_weight,
                 collector, categories, region, access_notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (id) DO UPDATE SET name=excluded.name, url=excluded.url,
                source_tier=excluded.source_tier, enabled=excluded.enabled,
                description=excluded.description, official=excluded.official,
                base_weight=excluded.base_weight, collector=excluded.collector,
                categories=excluded.categories, region=excluded.region,
                access_notes=excluded.access_notes""",
                (source.id, source.name, source.url, source.source_tier.value, source.enabled,
                 source.description, source.official, source.base_weight, source.collector,
                 json.dumps(list(source.categories)), source.region, source.access_notes),
            )
        return source

    def save_raw_item(self, item: RawItem) -> RawItem:
        with self._connect() as connection:
            row = connection.execute(
                """INSERT INTO raw_items
                (source_id, url, title, content, body, content_hash, collected_at,
                 published_at, metadata, content_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                ON CONFLICT (content_hash) DO UPDATE SET content_hash=excluded.content_hash
                RETURNING *""",
                (item.source_id, item.url, item.title, item.content, item.body,
                 item.content_hash, _utc(item.collected_at), _utc(item.published_at),
                 json.dumps(item.metadata, ensure_ascii=False, sort_keys=True), item.content_status),
            ).fetchone()
        return _raw_item(row)

    def count_raw_items(self) -> int:
        with self._connect() as connection:
            return connection.execute("SELECT COUNT(*) AS count FROM raw_items").fetchone()["count"]

    def get_raw_item(self, item_id: int) -> RawItem | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM raw_items WHERE id=%s", (item_id,)).fetchone()
        return _raw_item(row) if row else None

    def upsert_cluster(self, cluster: EventCluster) -> EventCluster:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO event_clusters
                (id, title, category, summary, created_at, updated_at, topic_key,
                 item_count, independent_source_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET title=excluded.title,
                category=excluded.category, summary=excluded.summary,
                updated_at=excluded.updated_at, topic_key=excluded.topic_key,
                item_count=excluded.item_count,
                independent_source_count=excluded.independent_source_count""",
                (cluster.id, cluster.title, cluster.category, cluster.summary,
                 _utc(cluster.created_at), _utc(cluster.updated_at), cluster.topic_key,
                 cluster.item_count, cluster.independent_source_count),
            )
        return cluster

    def get_cluster(self, cluster_id: str) -> EventCluster | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM event_clusters WHERE id=%s", (cluster_id,)).fetchone()
        return _cluster(row) if row else None

    def upsert_signal(self, signal: SignalRecord) -> SignalRecord:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO signals
                (id, cluster_id, category, title, summary, priority, source_confidence,
                 customer_demand_score, demand_kind, validation_status, published_at,
                 created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET cluster_id=excluded.cluster_id,
                category=excluded.category, title=excluded.title, summary=excluded.summary,
                priority=excluded.priority, source_confidence=excluded.source_confidence,
                customer_demand_score=excluded.customer_demand_score,
                demand_kind=excluded.demand_kind, validation_status=excluded.validation_status,
                published_at=excluded.published_at, updated_at=excluded.updated_at""",
                (signal.id, signal.cluster_id, signal.category, signal.title, signal.summary,
                 signal.priority, signal.source_confidence, signal.customer_demand_score,
                 signal.demand_kind.value, signal.validation_status.value,
                 _utc(signal.published_at), _utc(signal.created_at), _utc(signal.updated_at)),
            )
        return signal

    def get_signal(self, signal_id: str) -> SignalRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM signals WHERE id=%s", (signal_id,)).fetchone()
        return _signal(row) if row else None

    def list_signals(self, category: str | None = None) -> list[SignalRecord]:
        query = "SELECT * FROM signals"
        parameters = ()
        if category is not None:
            query += " WHERE category=%s"
            parameters = (category,)
        with self._connect() as connection:
            rows = connection.execute(query + " ORDER BY priority DESC, updated_at DESC", parameters).fetchall()
        return [_signal(row) for row in rows]

    def replace_signal_evidence(self, evidence: list[SignalEvidence]) -> list[SignalEvidence]:
        signal_ids = sorted({entry.signal_id for entry in evidence})
        with self._connect() as connection:
            for signal_id in signal_ids:
                connection.execute("DELETE FROM signal_evidence WHERE signal_id=%s", (signal_id,))
            for entry in evidence:
                connection.execute(
                    """INSERT INTO signal_evidence
                    (signal_id, raw_item_id, evidence_type, excerpt, source_confidence)
                    VALUES (%s, %s, %s, %s, %s)""",
                    (entry.signal_id, entry.raw_item_id, entry.evidence_type,
                     entry.excerpt, entry.source_confidence),
                )
        return self.list_signal_evidence_many(set(signal_ids))

    def list_signal_evidence(self, signal_id: str) -> list[SignalEvidence]:
        return self.list_signal_evidence_many({signal_id})

    def list_signal_evidence_many(self, signal_ids: set[str]) -> list[SignalEvidence]:
        if not signal_ids:
            return []
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM signal_evidence WHERE signal_id = ANY(%s) ORDER BY id",
                (sorted(signal_ids),),
            ).fetchall()
        return [_evidence(row) for row in rows]

    def upsert_catalyst(self, catalyst: CatalystRecord) -> CatalystRecord:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO catalysts
                (id, signal_id, title, scheduled_at, priority, description, validation_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET signal_id=excluded.signal_id,
                title=excluded.title, scheduled_at=excluded.scheduled_at,
                priority=excluded.priority, description=excluded.description,
                validation_status=excluded.validation_status""",
                (catalyst.id, catalyst.signal_id, catalyst.title, _utc(catalyst.scheduled_at),
                 catalyst.priority, catalyst.description, catalyst.validation_status.value),
            )
        return catalyst

    def list_catalysts(self) -> list[CatalystRecord]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM catalysts ORDER BY scheduled_at").fetchall()
        return [_catalyst(row) for row in rows]

    def save_brief(self, brief: DailyBrief) -> DailyBrief:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO daily_briefs
                (id, window_start, window_end, generated_at, body, status, signal_ids, top_call)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                ON CONFLICT (id) DO UPDATE SET window_start=excluded.window_start,
                window_end=excluded.window_end, generated_at=excluded.generated_at,
                body=excluded.body, status=excluded.status,
                signal_ids=excluded.signal_ids, top_call=excluded.top_call""",
                (brief.id, _utc(brief.window_start), _utc(brief.window_end),
                 _utc(brief.generated_at), brief.body, brief.status,
                 json.dumps(brief.signal_ids), brief.top_call),
            )
        return brief

    def get_brief(self, brief_id: str) -> DailyBrief | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM daily_briefs WHERE id=%s", (brief_id,)).fetchone()
        return _brief(row) if row else None

    def record_run(self, run: PipelineRun) -> PipelineRun:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO pipeline_runs
                (id, command, started_at, finished_at, status, summary)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET command=excluded.command,
                started_at=excluded.started_at, finished_at=excluded.finished_at,
                status=excluded.status, summary=excluded.summary""",
                (run.id, run.command, _utc(run.started_at), _utc(run.finished_at),
                 run.status, run.summary),
            )
        return run

    def get_run(self, run_id: str) -> PipelineRun | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM pipeline_runs WHERE id=%s", (run_id,)).fetchone()
        return _run(row) if row else None

    def list_runs(self, limit: int = 100) -> list[PipelineRun]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM pipeline_runs ORDER BY COALESCE(finished_at, started_at) DESC, id DESC LIMIT %s",
                (limit,),
            ).fetchall()
        return [_run(row) for row in rows]


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _dt(value):
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def _json(value):
    return json.loads(value) if isinstance(value, str) else value


def _raw_item(row):
    return RawItem(id=row["id"], source_id=row["source_id"], url=row["url"],
                   title=row["title"], body=row["body"], content_status=row["content_status"],
                   content=row["content"], content_hash=row["content_hash"],
                   collected_at=_dt(row["collected_at"]), published_at=_dt(row["published_at"]),
                   metadata=_json(row["metadata"]))


def _cluster(row):
    return EventCluster(id=row["id"], title=row["title"], category=row["category"],
                        summary=row["summary"], topic_key=row["topic_key"],
                        item_count=row["item_count"], independent_source_count=row["independent_source_count"],
                        created_at=_dt(row["created_at"]), updated_at=_dt(row["updated_at"]))


def _signal(row):
    return SignalRecord(id=row["id"], cluster_id=row["cluster_id"], category=row["category"],
                        title=row["title"], summary=row["summary"], priority=row["priority"],
                        source_confidence=row["source_confidence"],
                        customer_demand_score=row["customer_demand_score"],
                        demand_kind=DemandKind(row["demand_kind"]),
                        validation_status=ValidationStatus(row["validation_status"]),
                        published_at=_dt(row["published_at"]), created_at=_dt(row["created_at"]),
                        updated_at=_dt(row["updated_at"]))


def _evidence(row):
    return SignalEvidence(id=row["id"], signal_id=row["signal_id"],
                          raw_item_id=row["raw_item_id"], evidence_type=row["evidence_type"],
                          excerpt=row["excerpt"], source_confidence=row["source_confidence"])


def _catalyst(row):
    return CatalystRecord(id=row["id"], signal_id=row["signal_id"], title=row["title"],
                          scheduled_at=_dt(row["scheduled_at"]), priority=row["priority"],
                          description=row["description"],
                          validation_status=ValidationStatus(row["validation_status"]))


def _brief(row):
    return DailyBrief(id=row["id"], window_start=_dt(row["window_start"]),
                      window_end=_dt(row["window_end"]), generated_at=_dt(row["generated_at"]),
                      body=row["body"], status=row["status"], signal_ids=list(_json(row["signal_ids"])),
                      top_call=row["top_call"])


def _run(row):
    return PipelineRun(id=row["id"], command=row["command"], started_at=_dt(row["started_at"]),
                       finished_at=_dt(row["finished_at"]), status=row["status"], summary=row["summary"])
