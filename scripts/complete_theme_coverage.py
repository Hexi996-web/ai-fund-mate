import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_pipeline.catalog import load_indicator_catalog, load_source_catalog
from data_pipeline.cli import _write
from data_pipeline.coverage import build_complete_coverage
from data_pipeline.finalize_quality import deduplicate_events


if __name__ == "__main__":
    public = ROOT / "public/data/five-themes"
    observations = json.loads((public / "observations.json").read_text(encoding="utf-8"))
    documents = json.loads((public / "documents.json").read_text(encoding="utf-8"))
    quality = json.loads((public / "quality.json").read_text(encoding="utf-8"))
    sources = load_source_catalog(ROOT / "config/five_theme_sources.json")
    indicators = load_indicator_catalog(ROOT / "config/five_theme_indicators.json", sources)
    explicit = {
        "social_financing": "source_unavailable",
        "hstech_valuation": "source_unavailable",
        "integrated_circuit_output": "parse_failed",
        "us_real_yield_10y": "source_unavailable",
        "dividend_yield": "source_unavailable",
        "semiconductor_index": "source_unavailable",
        "semiconductor_sales": "source_unavailable",
        "bond_etf_share": "source_unavailable",
    }
    quality["coverage"] = build_complete_coverage(indicators, observations, documents, explicit)
    quality["sources"] = deduplicate_events(quality.get("sources", []) + [
        {"source":"semiconductor_index","status":"source_unavailable","message":"verified public index list did not expose a semiconductor representative index"},
        {"source":"semiconductor_sales","status":"source_unavailable","message":"no stable free public adapter verified in this iteration"},
        {"source":"bond_etf_share","status":"source_unavailable","message":"current ETF naming rules produced no verified aggregate; manual taxonomy required"},
    ])
    quality["normalIndicators"] = sum(value == "normal" for value in quality["coverage"].values())
    quality["degradedIndicators"] = sum(value not in {"normal", "missing"} for value in quality["coverage"].values())
    quality["missingIndicators"] = sum(value == "missing" for value in quality["coverage"].values())
    quality["status"] = "degraded" if quality["normalIndicators"] < len(indicators) else "normal"
    _write(public / "quality.json", quality)
    print(json.dumps({"normal":quality["normalIndicators"],"degraded":quality["degradedIndicators"],"missing":quality["missingIndicators"],"status":quality["status"]},ensure_ascii=False))
