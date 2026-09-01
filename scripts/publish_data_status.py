"""Publish a tiny version manifest so open browser sessions can detect new snapshots."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "data_status.json"
SHANGHAI = ZoneInfo("Asia/Shanghai")


def main() -> int:
    products = json.loads((PUBLIC / "fund_products.json").read_text(encoding="utf-8"))
    issuance = json.loads((PUBLIC / "issuance_insights.json").read_text(encoding="utf-8"))
    attention = json.loads((PUBLIC / "attention_pool_evidence.json").read_text(encoding="utf-8"))
    evidence = json.loads((PUBLIC / "pre_research_evidence.json").read_text(encoding="utf-8"))
    external = json.loads((PUBLIC / "theme_external_signals.json").read_text(encoding="utf-8"))
    payload = {
        "schemaVersion": 2,
        "dataDate": products["dataDate"],
        "snapshotDate": products["dataDate"],
        "productsUpdateTime": products["updateTime"],
        "issuanceDataDate": issuance["dataDate"],
        "attentionGeneratedAt": attention["generatedAt"],
        "preResearchUpdateTime": evidence["updateTime"],
        "externalSignalsGeneratedAt": external["generatedAt"],
        "generatedAt": datetime.now(SHANGHAI).isoformat(),
    }
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
