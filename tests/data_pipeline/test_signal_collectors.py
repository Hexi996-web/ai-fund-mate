import json
from pathlib import Path

import pytest

from data_pipeline.signal_collectors import collect_source, collect_sources
from data_pipeline.source_registry import load_source_registry


FIXTURES = Path(__file__).parent / "fixtures" / "signals"


def fixture_fetch(name):
    return lambda _url: (FIXTURES / name).read_text(encoding="utf-8")


def source(source_id):
    return next(entry for entry in load_source_registry(Path("config/signal_sources.json")) if entry.id == source_id)


def test_rss_collector_preserves_source_and_publication_time():
    result = collect_source(source("fed_rss"), fixture_fetch("fed.xml"))

    assert result.status == "normal"
    assert result.items[0].source_id == "fed_rss"
    assert result.items[0].published_at.tzinfo is not None


def test_html_without_body_is_title_only_and_incomplete():
    result = collect_source(source("csrc_policy"), fixture_fetch("title-only.html"))

    assert result.items[0].body is None
    assert result.items[0].content_status == "title_only"


def test_ics_collector_returns_timezone_aware_event():
    result = collect_source(source("bls_ics"), fixture_fetch("bls.ics"))

    assert result.status == "normal"
    assert result.items[0].title == "Employment Situation"
    assert result.items[0].published_at.tzinfo is not None


def test_invalid_registry_entries_are_rejected(tmp_path):
    registry = tmp_path / "invalid.json"
    registry.write_text(json.dumps([
        {"id": "one", "name": "One", "tier": "official", "official": True, "base_weight": 0.8,
         "collector": "unknown", "url": "http://example.com", "categories": [], "region": "CN",
         "enabled": True, "access_notes": "public"},
    ]), encoding="utf-8")

    with pytest.raises(ValueError, match="collector"):
        load_source_registry(registry)


def test_batch_keeps_successful_source_when_another_times_out():
    sources = [source("fed_rss"), source("ecb_rss")]

    def fetch(url):
        if "ecb" in url:
            raise TimeoutError("fixture timeout")
        return (FIXTURES / "fed.xml").read_text(encoding="utf-8")

    results = collect_sources(sources, fetch)

    assert results[0].status == "normal"
    assert results[1].status == "failed"
    assert "fixture timeout" in results[1].message
@pytest.mark.parametrize(
    ("change", "match"),
    [
        (lambda entry: entry.update(url="http://example.com"), "HTTPS"),
        (lambda entry: entry.update(base_weight=1.01), "base_weight"),
    ],
)
def test_registry_rejects_unsafe_url_and_weight_bounds(tmp_path, change, match):
    entry = json.loads(Path("config/signal_sources.json").read_text(encoding="utf-8"))[0]
    change(entry)
    registry = tmp_path / "invalid.json"
    registry.write_text(json.dumps([entry]), encoding="utf-8")

    with pytest.raises(ValueError, match=match):
        load_source_registry(registry)


def test_registry_rejects_duplicate_ids(tmp_path):
    entry = json.loads(Path("config/signal_sources.json").read_text(encoding="utf-8"))[0]
    registry = tmp_path / "duplicates.json"
    registry.write_text(json.dumps([entry, entry]), encoding="utf-8")

    with pytest.raises(ValueError, match="duplicate"):
        load_source_registry(registry)