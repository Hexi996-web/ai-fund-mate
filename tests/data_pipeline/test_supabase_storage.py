import pytest

from data_pipeline.supabase_storage import SupabaseSignalRepository


EXPECTED_RELATIONS = [
    "signal_schema_versions", "sources", "raw_items", "event_clusters", "signals",
    "signal_evidence", "catalysts", "daily_briefs", "pipeline_runs",
    "published_signals", "published_catalysts", "published_daily_briefs",
]
EXPECTED_COLUMNS = [
    "catalysts.id", "catalysts.scheduled_at", "daily_briefs.id",
    "daily_briefs.signal_ids", "event_clusters.id", "pipeline_runs.id",
    "raw_items.id", "raw_items.source_id", "signal_evidence.id",
    "signal_evidence.signal_id", "signal_schema_versions.version", "signals.id",
    "signals.published_at", "sources.id",
]
EXPECTED_INDEXES = [
    "catalysts_scheduled_at_idx", "raw_items_published_at_idx",
    "signals_category_priority_idx", "signals_cluster_id_idx",
]
EXPECTED_BASE_TABLES = [
    "catalysts", "daily_briefs", "event_clusters", "pipeline_runs", "raw_items",
    "signal_evidence", "signals", "sources",
]
EXPECTED_VIEWS = ["published_catalysts", "published_daily_briefs", "published_signals"]


class Cursor:
    def __init__(self, row):
        self.row = row

    def fetchone(self):
        return self.row


class Connection:
    def __init__(self, rows):
        self.rows = iter(rows)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, _query, _parameters=()):
        return Cursor(next(self.rows))


def complete_contract_rows():
    return [
        {"relations": EXPECTED_RELATIONS},
        {"version": 202608140001},
        {"columns": EXPECTED_COLUMNS},
        {"indexes": EXPECTED_INDEXES},
        {"rls_tables": EXPECTED_BASE_TABLES},
        {"writer_tables": EXPECTED_BASE_TABLES},
        {"anon_views": EXPECTED_VIEWS},
    ]


def repo_with_contract(rows):
    repo = SupabaseSignalRepository("postgresql://localhost/signals")
    repo._connect = lambda: Connection(rows)
    return repo


def test_initialize_accepts_only_complete_current_schema():
    repo_with_contract(complete_contract_rows()).initialize()


def test_initialize_rejects_missing_relation():
    rows = complete_contract_rows()
    rows[0] = {"relations": EXPECTED_RELATIONS[:-1]}

    with pytest.raises(RuntimeError, match="published_daily_briefs"):
        repo_with_contract(rows).initialize()


def test_initialize_rejects_wrong_schema_version():
    rows = complete_contract_rows()
    rows[1] = {"version": 202608140000}

    with pytest.raises(RuntimeError, match="202608140001"):
        repo_with_contract(rows).initialize()


def test_initialize_rejects_missing_required_column():
    rows = complete_contract_rows()
    rows[2] = {"columns": EXPECTED_COLUMNS[:-1]}

    with pytest.raises(RuntimeError, match="sources.id"):
        repo_with_contract(rows).initialize()


def test_initialize_rejects_missing_required_index():
    rows = complete_contract_rows()
    rows[3] = {"indexes": EXPECTED_INDEXES[:-1]}

    with pytest.raises(RuntimeError, match="signals_cluster_id_idx"):
        repo_with_contract(rows).initialize()


def test_initialize_rejects_incomplete_rls_or_privilege_contract():
    rows = complete_contract_rows()
    rows[4] = {"rls_tables": EXPECTED_BASE_TABLES[:-1]}

    with pytest.raises(RuntimeError, match="sources"):
        repo_with_contract(rows).initialize()
