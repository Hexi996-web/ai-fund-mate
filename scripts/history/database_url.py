"""Resolve and validate the shared Supabase IPv4 Session pooler URI."""
from __future__ import annotations

import os
from urllib.parse import urlparse


def database_url(required: bool = False) -> str | None:
    value = os.getenv("HISTORY_DATABASE_URL") or os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if not value:
        if required:
            raise RuntimeError("缺少 HISTORY_DATABASE_URL、DATABASE_URL 或 SUPABASE_DB_URL")
        return None
    parsed = urlparse(value)
    if parsed.scheme not in {"postgres", "postgresql"} or not (parsed.hostname or "").endswith(".pooler.supabase.com") or parsed.port != 5432:
        raise RuntimeError("数据库必须使用 Supabase IPv4 Session pooler URI（端口 5432）")
    return value
