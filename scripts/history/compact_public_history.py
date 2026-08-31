"""Keep only a small resilient UI fallback after full history is stored in PostgreSQL."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def compact_social(payload: dict) -> dict:
    snapshots = payload.get("snapshots") or []
    latest_day = max((item.get("capturedAt", "")[:10] for item in snapshots), default="")
    return {**payload, "snapshots": [item for item in snapshots if item.get("capturedAt", "").startswith(latest_day)],
            "daily": (payload.get("daily") or [])[-7:], "weekly": (payload.get("weekly") or [])[-4:],
            "monthly": (payload.get("monthly") or [])[-2:],
            "retention": {**(payload.get("retention") or {}), "publicFallback": "today raw / 7 daily / 4 weekly / 2 monthly; full history in PostgreSQL"}}


def compact_attention(payload: dict) -> dict:
    return {**payload, "rankingHistory": (payload.get("rankingHistory") or [])[-2:],
            "historyStorage": {"primary": "PostgreSQL", "publicFallbackRankingPeriods": 2}}


def rewrite(path: Path, transform) -> None:
    payload = transform(json.loads(path.read_text(encoding="utf-8")))
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    rewrite(ROOT / "public" / "social_attention_history.json", compact_social)
    rewrite(ROOT / "public" / "attention_pool_evidence.json", compact_attention)
    print("已压缩公开历史回退快照；完整历史保留在 PostgreSQL")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
