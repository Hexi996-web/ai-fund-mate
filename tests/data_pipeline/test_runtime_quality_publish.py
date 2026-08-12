import json
from datetime import date, datetime, timedelta, timezone

from data_pipeline.collectors.base import CollectorRegistry, run_collectors
from data_pipeline.domain import IndicatorSpec, EvidenceType, Observation, QualityStatus, Theme
from data_pipeline.fund_theme import link_funds
from data_pipeline.publish import build_publication
from data_pipeline.quality import evaluate_observation


class GoodCollector:
    def fetch(self, context): return b"ok"
    def normalize(self, raw, context): return ["record"]
    def validate(self, records, context): return []


class BadCollector:
    def fetch(self, context): raise TimeoutError("offline")


def test_collector_failures_are_isolated():
    registry = CollectorRegistry(); registry.register("good", GoodCollector); registry.register("bad", BadCollector)
    summary = run_collectors(["good", "bad"], registry, {})
    assert summary.results["good"].records == ["record"]
    assert summary.results["bad"].quality_status is QualityStatus.SOURCE_UNAVAILABLE


def test_stale_observation_is_not_current_publishable():
    spec = IndicatorSpec("x", Theme.GOLD, EvidenceType.FUNDS, "X", "点", "daily", "s", (), 24, {"min": 0}, False)
    obs = Observation("x", "s", date(2026, 8, 1), datetime(2026, 8, 1, tzinfo=timezone.utc), 2, None, "点", "", QualityStatus.NORMAL, "S", "https://s.test", None, "abc", False)
    events = evaluate_observation(obs, spec, datetime(2026, 8, 3, tzinfo=timezone.utc))
    assert events[0].status is QualityStatus.STALE


def test_fund_links_are_explainable_and_overridable():
    funds={"funds":[{"code":"518880","name":"华安黄金ETF","type":"商品型"},{"code":"000001","name":"普通混合","type":"混合型"}]}
    rules=[{"id":"gold_etf","theme":"gold","required_any":["黄金ETF"],"excluded":[]}]
    links=link_funds(funds,rules,[])
    assert [(x.fund_code,x.theme.value,x.matched_rule) for x in links] == [("518880","gold","gold_etf")]


def test_publication_contains_same_origin_contract_without_raw_bodies():
    payload=build_publication([], [], [], generated_at="2026-08-12T00:00:00Z")
    assert payload["manifest"]["schemaVersion"] == 1
    assert len(payload["themes"]) == 5
    assert "raw_body" not in json.dumps(payload)
