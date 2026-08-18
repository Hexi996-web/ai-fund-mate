"""Command-line entry point for signal collection, briefs, snapshots, and health."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import replace
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from .catalysts import normalize_catalysts
from .daily_brief import build_daily_brief
from .signal_cluster import cluster_items
from .signal_domain import DemandKind, PipelineRun, SignalEvidence, SignalRecord, ValidationStatus
from .signal_publish import health_payload, publish_snapshot
from .signal_rules import SignalDraft, classify_cluster, load_signal_rules
from .signal_scoring import score_signal
from .signal_storage import SignalRepository
from .source_registry import load_source_registry
from .supabase_storage import SupabaseSignalRepository


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = Path(".tmp/signals.db")
FIXTURE_FILES = {
    "csrc_policy": "title-only.html",
    "fed_rss": "fed.xml",
    "bls_ics": "bls.ics",
}
DEMAND_KINDS = {
    "customer_real": DemandKind.DIRECT,
    "customer_proxy": DemandKind.PROXY,
    "media_attention": DemandKind.MEDIA_ATTENTION,
}


def repository_for(db_path=None, *, fixtures: bool = False):
    """Select PostgreSQL only for server runs explicitly configured with a URL."""
    if fixtures or db_path is not None or not os.environ.get("SUPABASE_DB_URL"):
        return SignalRepository(db_path or DEFAULT_DB)
    return SupabaseSignalRepository()


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except ValueError as error:
        parser.error(str(error))
    return 2


def _collect(args) -> int:
    repo = repository_for(args.db, fixtures=args.fixtures)
    repo.initialize()
    as_of = args.as_of or _now()
    try:
        sources = load_source_registry(ROOT / "config" / "signal_sources.json")
        fixtures_dir = ROOT / "tests" / "data_pipeline" / "fixtures" / "signals"
        collected = []
        successful_sources = 0
        failed_sources = 0
        for source in sources:
            repo.upsert_source(source)
            if not source.enabled:
                continue
            from .signal_collectors import collect_source

            if args.fixtures:
                fixture_name = FIXTURE_FILES.get(source.id)
                if fixture_name is None:
                    continue
                fetch = lambda _url, name=fixture_name: (fixtures_dir / name).read_text(encoding="utf-8")
            else:
                fetch = _live_fetch
            result = collect_source(source, fetch)
            if result.status != "normal":
                failed_sources += 1
                continue
            successful_sources += 1
            for item in result.items:
                collected.append(repo.save_raw_item(replace(item, collected_at=as_of)))

        _persist_derived_records(repo, sources, collected, as_of)
        summary = {
            "backend": "sqlite" if isinstance(repo, SignalRepository) else "postgresql",
            "fixtures": args.fixtures,
            "successfulSources": successful_sources,
            "failedSources": failed_sources,
            "rawItems": len(collected),
        }
    except Exception as error:
        _record(repo, "collect", as_of, {"errorType": type(error).__name__}, status="failed")
        raise

    status = "failed" if successful_sources == 0 else "partial" if failed_sources else "success"
    _record(repo, "collect", as_of, summary, status=status)
    print(json.dumps(summary, sort_keys=True))
    return 1 if status == "failed" else 0

def _live_fetch(url: str) -> bytes:
    """Fetch one registry-approved public URL without bypassing access controls."""
    import requests

    response = requests.get(
        url,
        timeout=20,
        headers={"User-Agent": "fund-signal-intelligence/1.0 (public-source collector)"},
    )
    response.raise_for_status()
    return response.content


def _persist_derived_records(repo, sources, raw_items, as_of):
    source_by_id = {source.id: source for source in sources}
    rules = load_signal_rules(ROOT / "config" / "signal_rules.json")
    unclassified_count = 0
    clusters = sorted(cluster_items(raw_items, []), key=lambda item: item.updated_at, reverse=True)
    for cluster in clusters:
        repo.upsert_cluster(cluster)
        if not cluster.raw_items:
            continue
        draft = classify_cluster(cluster, rules)
        if draft is None:
            # Persist a modest candidate pool; publication selects the top 10
            # across classified and unclassified signals by transparent score.
            if unclassified_count >= 25:
                continue
            draft = _unclassified_draft(cluster)
            unclassified_count += 1
        source = source_by_id[cluster.raw_items[0].source_id]
        score = score_signal(source, cluster, draft, [], as_of)
        signal = SignalRecord(
            id=f"signal-{sha256(cluster.id.encode('utf-8')).hexdigest()[:16]}",
            cluster_id=cluster.id,
            category=draft.category,
            title=cluster.title,
            summary=draft.transmission,
            priority=round(score.priority),
            source_confidence=score.source_score,
            customer_demand_score=score.customer_demand_score or 0.0,
            demand_kind=DEMAND_KINDS.get(draft.demand_kind, DemandKind.UNKNOWN),
            validation_status=(
                ValidationStatus.CONFIRMED if source.official
                else ValidationStatus.PENDING_OFFICIAL_VALIDATION
            ),
            published_at=cluster.updated_at,
            created_at=cluster.created_at,
            updated_at=cluster.updated_at,
        )
        repo.upsert_signal(signal)
        repo.replace_signal_evidence([
            SignalEvidence(
                signal_id=signal.id,
                raw_item_id=item.id,
                evidence_type=source.source_tier.value,
                excerpt=item.body or item.title,
                source_confidence=source.base_weight,
            )
            for item in cluster.raw_items
            if item.id is not None
        ])
    for catalyst in normalize_catalysts(raw_items, as_of):
        repo.upsert_catalyst(catalyst)


def _unclassified_draft(cluster):
    """Keep traceable collected evidence publishable when enrichment has no match."""
    first = cluster.raw_items[0]
    excerpt = (first.body or first.content or first.title).strip()
    return SignalDraft(
        category="unclassified",
        direction="neutral",
        horizon="unknown",
        assets=[],
        fund_keywords=[],
        themes=[],
        fact=cluster.title,
        transmission=excerpt[:500] or "已抓取，等待规则或人工研判。",
        demand_kind="unknown",
    )


def _brief(args) -> int:
    repo = repository_for(args.db)
    repo.initialize()
    try:
        brief = build_daily_brief(repo, args.run_at)
        repo.save_brief(brief)
        summary = {"briefId": brief.id, "signals": len(brief.signal_ids)}
    except Exception as error:
        _record(repo, "brief", args.run_at, {"errorType": type(error).__name__}, status="failed")
        raise
    _record(repo, "brief", args.run_at, summary)
    print(json.dumps(summary, sort_keys=True))
    return 0

def _publish(args) -> int:
    repo = repository_for(args.db)
    repo.initialize()
    generated_at = args.generated_at or _now()
    try:
        payload = publish_snapshot(repo, args.output, generated_at=generated_at)
        summary = {"output": str(args.output), "signals": len(payload["signals"])}
    except Exception as error:
        _record(repo, "publish", generated_at, {"errorType": type(error).__name__}, status="failed")
        raise
    _record(repo, "publish", generated_at, summary)
    print(json.dumps(summary, sort_keys=True))
    return 0

def _health(args) -> int:
    repo = repository_for(args.db)
    repo.initialize()
    backend = "sqlite" if isinstance(repo, SignalRepository) else "postgresql"
    print(json.dumps(
        health_payload(repo, generated_at=args.generated_at, backend=backend),
        sort_keys=True,
    ))
    return 0

def _record(
    repo, command: str, instant: datetime, summary: dict, *, status: str = "success",
) -> None:
    finished = _now()
    identifier = sha256(f"{command}|{instant.astimezone(timezone.utc).isoformat()}".encode("utf-8")).hexdigest()[:20]
    repo.record_run(PipelineRun(
        id=f"{command}-{identifier}", command=command, started_at=instant,
        finished_at=finished, status=status,
        summary=json.dumps(summary, ensure_ascii=False, sort_keys=True),
    ))


def _now() -> datetime:
    return datetime.now(timezone.utc)

def _timestamp(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise argparse.ArgumentTypeError("timestamp must be ISO 8601") from error
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("timestamp must include a UTC offset")
    return parsed


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Signal-intelligence pipeline")
    commands = parser.add_subparsers(dest="command", required=True)

    collect = commands.add_parser("collect")
    collect.add_argument("--db", type=Path)
    collect.add_argument("--as-of", type=_timestamp)
    collect.add_argument("--fixtures", action="store_true")
    collect.set_defaults(handler=_collect)

    brief = commands.add_parser("brief")
    brief.add_argument("--db", type=Path)
    brief.add_argument("--run-at", type=_timestamp, required=True)
    brief.set_defaults(handler=_brief)

    publish = commands.add_parser("publish")
    publish.add_argument("--db", type=Path)
    publish.add_argument("--output", type=Path, required=True)
    publish.add_argument("--generated-at", type=_timestamp)
    publish.set_defaults(handler=_publish)

    health = commands.add_parser("health")
    health.add_argument("--db", type=Path)
    health.add_argument("--generated-at", type=_timestamp)
    health.set_defaults(handler=_health)
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
