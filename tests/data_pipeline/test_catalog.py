from collections import Counter
from pathlib import Path

import pytest

from data_pipeline.catalog import CatalogError, load_indicator_catalog, load_source_catalog


def test_catalog_contains_five_themes_and_five_indicators_each():
    sources = load_source_catalog(Path("config/five_theme_sources.json"))
    indicators = load_indicator_catalog(Path("config/five_theme_indicators.json"), sources)
    counts = Counter(item.theme.value for item in indicators.values())
    assert counts == {
        "gold": 5,
        "ai_semiconductor": 5,
        "dividend": 5,
        "bond": 5,
        "hong_kong_tech": 5,
    }


def test_indicator_rejects_unknown_source(tmp_path):
    path = tmp_path / "indicators.json"
    path.write_text('[{"id":"x","theme":"gold","evidence_type":"funds","name":"X","unit":"点","frequency":"daily","primary_source":"unknown","backup_sources":[],"stale_after_hours":24,"validation":{"min":0},"is_estimate":false}]', encoding="utf-8")
    with pytest.raises(CatalogError, match="unknown"):
        load_indicator_catalog(path, {})
