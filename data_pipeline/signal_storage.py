import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

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


def _utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value is not None else None


class SignalRepository:
    def __init__(self, db_path):
        self.db_path = Path(db_path)

    def _connect(self):
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def initialize(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
                    source_tier TEXT NOT NULL, enabled INTEGER NOT NULL, description TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS raw_items (
                    id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, url TEXT NOT NULL,
                    title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE,
                    collected_at TEXT NOT NULL, published_at TEXT, metadata TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS event_clusters (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
                    summary TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS signals (
                    id TEXT PRIMARY KEY, cluster_id TEXT, category TEXT NOT NULL, title TEXT NOT NULL,
                    summary TEXT NOT NULL, priority INTEGER NOT NULL, source_confidence REAL NOT NULL,
                    customer_demand_score REAL NOT NULL, demand_kind TEXT NOT NULL,
                    validation_status TEXT NOT NULL, published_at TEXT, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS signal_evidence (
                    id INTEGER PRIMARY KEY, signal_id TEXT NOT NULL, raw_item_id INTEGER NOT NULL,
                    evidence_type TEXT NOT NULL, excerpt TEXT NOT NULL, source_confidence REAL NOT NULL,
                    FOREIGN KEY(signal_id) REFERENCES signals(id) ON DELETE CASCADE,
                    FOREIGN KEY(raw_item_id) REFERENCES raw_items(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS catalysts (
                    id TEXT PRIMARY KEY, signal_id TEXT, title TEXT NOT NULL, scheduled_at TEXT NOT NULL,
                    priority INTEGER NOT NULL, description TEXT NOT NULL, validation_status TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS daily_briefs (
                    id TEXT PRIMARY KEY, window_start TEXT NOT NULL, window_end TEXT NOT NULL,
                    generated_at TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS pipeline_runs (
                    id TEXT PRIMARY KEY, command TEXT NOT NULL, started_at TEXT NOT NULL,
                    finished_at TEXT, status TEXT NOT NULL, summary TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS raw_items_published_at_idx ON raw_items(published_at);
                CREATE INDEX IF NOT EXISTS signals_category_priority_idx ON signals(category, priority DESC);
                CREATE INDEX IF NOT EXISTS signals_cluster_id_idx ON signals(cluster_id);
                CREATE INDEX IF NOT EXISTS catalysts_scheduled_at_idx ON catalysts(scheduled_at);
                """
            )

    def upsert_source(self, source: SourceRecord) -> SourceRecord:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url,
                source_tier=excluded.source_tier, enabled=excluded.enabled, description=excluded.description""",
                (source.id, source.name, source.url, source.source_tier.value, int(source.enabled), source.description),
            )
        return source

    def save_raw_item(self, item: RawItem) -> RawItem:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO raw_items(source_id, url, title, content, content_hash, collected_at, published_at, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(content_hash) DO NOTHING""",
                (item.source_id, item.url, item.title, item.content, item.content_hash, _utc_iso(item.collected_at),
                 _utc_iso(item.published_at), json.dumps(item.metadata, ensure_ascii=False, sort_keys=True)),
            )
            row = connection.execute("SELECT * FROM raw_items WHERE content_hash=?", (item.content_hash,)).fetchone()
        return self._raw_item(row)

    def count_raw_items(self) -> int:
        with self._connect() as connection:
            return connection.execute("SELECT COUNT(*) FROM raw_items").fetchone()[0]

    def get_raw_item(self, item_id: int) -> RawItem | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM raw_items WHERE id=?", (item_id,)).fetchone()
        return self._raw_item(row) if row else None

    def upsert_cluster(self, cluster: EventCluster) -> EventCluster:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO event_clusters VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category,
                summary=excluded.summary, updated_at=excluded.updated_at""",
                (cluster.id, cluster.title, cluster.category, cluster.summary, _utc_iso(cluster.created_at), _utc_iso(cluster.updated_at)),
            )
        return cluster

    def get_cluster(self, cluster_id: str) -> EventCluster | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM event_clusters WHERE id=?", (cluster_id,)).fetchone()
        return self._cluster(row) if row else None

    def upsert_signal(self, signal: SignalRecord) -> SignalRecord:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO signals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET cluster_id=excluded.cluster_id, category=excluded.category,
                title=excluded.title, summary=excluded.summary, priority=excluded.priority,
                source_confidence=excluded.source_confidence, customer_demand_score=excluded.customer_demand_score,
                demand_kind=excluded.demand_kind, validation_status=excluded.validation_status,
                published_at=excluded.published_at, updated_at=excluded.updated_at""",
                (signal.id, signal.cluster_id, signal.category, signal.title, signal.summary, signal.priority,
                 signal.source_confidence, signal.customer_demand_score, signal.demand_kind.value,
                 signal.validation_status.value, _utc_iso(signal.published_at), _utc_iso(signal.created_at), _utc_iso(signal.updated_at)),
            )
        return signal

    def get_signal(self, signal_id: str) -> SignalRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM signals WHERE id=?", (signal_id,)).fetchone()
        return self._signal(row) if row else None

    def list_signals(self, category: str | None = None) -> list[SignalRecord]:
        query, parameters = "SELECT * FROM signals", ()
        if category is not None:
            query, parameters = query + " WHERE category=?", (category,)
        with self._connect() as connection:
            rows = connection.execute(query + " ORDER BY priority DESC, updated_at DESC", parameters).fetchall()
        return [self._signal(row) for row in rows]

    def replace_signal_evidence(self, evidence: list[SignalEvidence]) -> list[SignalEvidence]:
        signal_ids = {entry.signal_id for entry in evidence}
        with self._connect() as connection:
            for signal_id in signal_ids:
                connection.execute("DELETE FROM signal_evidence WHERE signal_id=?", (signal_id,))
            for entry in evidence:
                connection.execute(
                    "INSERT INTO signal_evidence(signal_id, raw_item_id, evidence_type, excerpt, source_confidence) VALUES (?, ?, ?, ?, ?)",
                    (entry.signal_id, entry.raw_item_id, entry.evidence_type, entry.excerpt, entry.source_confidence),
                )
        return self.list_signal_evidence_many(signal_ids)

    def list_signal_evidence(self, signal_id: str) -> list[SignalEvidence]:
        return self.list_signal_evidence_many({signal_id})

    def list_signal_evidence_many(self, signal_ids: set[str]) -> list[SignalEvidence]:
        if not signal_ids:
            return []
        placeholders = ", ".join("?" for _ in signal_ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT * FROM signal_evidence WHERE signal_id IN ({placeholders}) ORDER BY id", tuple(signal_ids)
            ).fetchall()
        return [self._evidence(row) for row in rows]

    def upsert_catalyst(self, catalyst: CatalystRecord) -> CatalystRecord:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO catalysts VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET signal_id=excluded.signal_id, title=excluded.title,
                scheduled_at=excluded.scheduled_at, priority=excluded.priority, description=excluded.description,
                validation_status=excluded.validation_status""",
                (catalyst.id, catalyst.signal_id, catalyst.title, _utc_iso(catalyst.scheduled_at), catalyst.priority,
                 catalyst.description, catalyst.validation_status.value),
            )
        return catalyst

    def list_catalysts(self) -> list[CatalystRecord]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM catalysts ORDER BY scheduled_at").fetchall()
        return [self._catalyst(row) for row in rows]

    def save_brief(self, brief: DailyBrief) -> DailyBrief:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO daily_briefs VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET window_start=excluded.window_start, window_end=excluded.window_end,
                generated_at=excluded.generated_at, body=excluded.body, status=excluded.status""",
                (brief.id, _utc_iso(brief.window_start), _utc_iso(brief.window_end), _utc_iso(brief.generated_at), brief.body, brief.status),
            )
        return brief

    def get_brief(self, brief_id: str) -> DailyBrief | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM daily_briefs WHERE id=?", (brief_id,)).fetchone()
        return self._brief(row) if row else None

    def record_run(self, run: PipelineRun) -> PipelineRun:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO pipeline_runs VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET command=excluded.command, started_at=excluded.started_at,
                finished_at=excluded.finished_at, status=excluded.status, summary=excluded.summary""",
                (run.id, run.command, _utc_iso(run.started_at), _utc_iso(run.finished_at), run.status, run.summary),
            )
        return run

    def get_run(self, run_id: str) -> PipelineRun | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM pipeline_runs WHERE id=?", (run_id,)).fetchone()
        return self._run(row) if row else None

    @staticmethod
    def _raw_item(row):
        return RawItem(id=row["id"], source_id=row["source_id"], url=row["url"], title=row["title"], content=row["content"],
                       content_hash=row["content_hash"], collected_at=_datetime(row["collected_at"]),
                       published_at=_datetime(row["published_at"]), metadata=json.loads(row["metadata"]))

    @staticmethod
    def _cluster(row):
        return EventCluster(id=row["id"], title=row["title"], category=row["category"], summary=row["summary"],
                            created_at=_datetime(row["created_at"]), updated_at=_datetime(row["updated_at"]))

    @staticmethod
    def _signal(row):
        return SignalRecord(id=row["id"], cluster_id=row["cluster_id"], category=row["category"], title=row["title"],
                            summary=row["summary"], priority=row["priority"], source_confidence=row["source_confidence"],
                            customer_demand_score=row["customer_demand_score"], demand_kind=DemandKind(row["demand_kind"]),
                            validation_status=ValidationStatus(row["validation_status"]), published_at=_datetime(row["published_at"]),
                            created_at=_datetime(row["created_at"]), updated_at=_datetime(row["updated_at"]))

    @staticmethod
    def _evidence(row):
        return SignalEvidence(id=row["id"], signal_id=row["signal_id"], raw_item_id=row["raw_item_id"],
                              evidence_type=row["evidence_type"], excerpt=row["excerpt"], source_confidence=row["source_confidence"])

    @staticmethod
    def _catalyst(row):
        return CatalystRecord(id=row["id"], signal_id=row["signal_id"], title=row["title"],
                              scheduled_at=_datetime(row["scheduled_at"]), priority=row["priority"],
                              description=row["description"], validation_status=ValidationStatus(row["validation_status"]))

    @staticmethod
    def _brief(row):
        return DailyBrief(id=row["id"], window_start=_datetime(row["window_start"]), window_end=_datetime(row["window_end"]),
                          generated_at=_datetime(row["generated_at"]), body=row["body"], status=row["status"])

    @staticmethod
    def _run(row):
        return PipelineRun(id=row["id"], command=row["command"], started_at=_datetime(row["started_at"]),
                           finished_at=_datetime(row["finished_at"]), status=row["status"], summary=row["summary"])
