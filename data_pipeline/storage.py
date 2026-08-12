import sqlite3
from pathlib import Path
from .domain import Observation, QualityStatus, UpsertStats

class DataRepository:
    def __init__(self, db_path): self.db_path = Path(db_path)
    def _connect(self):
        conn=sqlite3.connect(self.db_path); conn.row_factory=sqlite3.Row; conn.execute("PRAGMA foreign_keys=ON"); return conn
    def initialize(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as c:
            c.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, payload TEXT);
            CREATE TABLE IF NOT EXISTS indicators(id TEXT PRIMARY KEY, payload TEXT);
            CREATE TABLE IF NOT EXISTS raw_snapshots(sha256 TEXT PRIMARY KEY, source_id TEXT, path TEXT);
            CREATE TABLE IF NOT EXISTS observations(indicator_id TEXT, effective_date TEXT, source_id TEXT, dimension_key TEXT DEFAULT '', collected_at TEXT, numeric_value REAL, text_value TEXT, unit TEXT, quality_status TEXT, source_name TEXT, source_url TEXT, published_at TEXT, raw_snapshot_sha256 TEXT, is_estimate INTEGER, PRIMARY KEY(indicator_id,effective_date,source_id,dimension_key));
            CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY, source_id TEXT, effective_date TEXT, body TEXT);
            CREATE TABLE IF NOT EXISTS quality_events(id INTEGER PRIMARY KEY, run_id INTEGER, status TEXT, message TEXT);
            CREATE TABLE IF NOT EXISTS pipeline_runs(id INTEGER PRIMARY KEY, command TEXT, started_at TEXT, status TEXT, summary TEXT);
            CREATE TABLE IF NOT EXISTS fund_theme_links(fund_code TEXT, theme TEXT, match_type TEXT, matched_rule TEXT, confidence REAL, review_status TEXT, PRIMARY KEY(fund_code,theme));
            PRAGMA user_version=1;
            """)
    def upsert_observations(self, observations):
        inserted=updated=0
        with self._connect() as c:
            for o in observations:
                exists=c.execute("SELECT 1 FROM observations WHERE indicator_id=? AND effective_date=? AND source_id=? AND dimension_key=?",(o.indicator_id,o.effective_date.isoformat(),o.source_id,o.dimension_key)).fetchone()
                c.execute("INSERT OR REPLACE INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",(o.indicator_id,o.effective_date.isoformat(),o.source_id,o.dimension_key,o.collected_at.isoformat(),o.numeric_value,o.text_value,o.unit,o.quality_status.value,o.source_name,o.source_url,o.published_at.isoformat() if o.published_at else None,o.raw_snapshot_sha256,int(o.is_estimate)))
                if exists: updated+=1
                else: inserted+=1
        return UpsertStats(inserted,updated)
    def latest_observations(self):
        with self._connect() as c: return [dict(r) for r in c.execute("SELECT * FROM observations ORDER BY indicator_id,effective_date")]
