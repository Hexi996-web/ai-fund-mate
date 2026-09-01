import pytest

from scripts.history.database_url import database_url


def test_accepts_only_supabase_ipv4_session_pooler(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres.project:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres")
    assert database_url(required=True).endswith(":5432/postgres")


@pytest.mark.parametrize("value", [
    "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
    "postgresql://postgres.project:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    "not-a-database-url",
])
def test_rejects_direct_and_transaction_pooler_urls(monkeypatch, value):
    monkeypatch.setenv("DATABASE_URL", value)
    with pytest.raises(RuntimeError, match="IPv4 Session pooler"):
        database_url(required=True)
