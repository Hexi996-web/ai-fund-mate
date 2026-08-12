import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_pipeline.catalog import load_indicator_catalog, load_source_catalog
from data_pipeline.cli import _write
from data_pipeline.finalize_quality import build_coverage, deduplicate_events


if __name__ == "__main__":
    public = ROOT / "public/data/five-themes"
    observations = json.loads((public / "observations.json").read_text(encoding="utf-8"))
    quality = json.loads((public / "quality.json").read_text(encoding="utf-8"))
    sources = load_source_catalog(ROOT / "config/five_theme_sources.json")
    indicators = load_indicator_catalog(ROOT / "config/five_theme_indicators.json", sources)
    explicit = {
        "social_financing": "source_unavailable",
        "hstech_valuation": "source_unavailable",
        "integrated_circuit_output": "parse_failed",
        "us_real_yield_10y": "source_unavailable",
        "dividend_yield": "source_unavailable",
    }
    quality["sources"] = deduplicate_events(quality.get("sources", []) + [
        {"source": "fred_real_yield", "status": "source_unavailable", "message": "FRED CSV timed out during verified direct smoke test"},
        {"source": "nbs_catalog", "status": "source_unavailable", "message": "NBS directory endpoint returned HTTP 403 during verified direct smoke test"},
    ])
    quality["coverage"] = build_coverage(indicators, observations, explicit)
    quality["configuredIndicators"] = len(indicators)
    quality["normalIndicators"] = sum(value == "normal" for value in quality["coverage"].values())
    quality["degradedIndicators"] = sum(value not in {"normal", "missing"} for value in quality["coverage"].values())
    quality["missingIndicators"] = sum(value == "missing" for value in quality["coverage"].values())
    quality["status"] = "degraded" if quality["normalIndicators"] < len(indicators) else "normal"
    _write(public / "quality.json", quality)
    print(json.dumps({key: quality[key] for key in ("configuredIndicators", "normalIndicators", "degradedIndicators", "missingIndicators", "status")}, ensure_ascii=False))
