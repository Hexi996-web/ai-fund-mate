import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_agent_context_matches_published_status_and_core_pool():
    status = json.loads((ROOT / "public/data_status.json").read_text(encoding="utf-8"))
    context = json.loads((ROOT / "public/agent_context.json").read_text(encoding="utf-8"))
    assert context["snapshotDate"] == status["snapshotDate"]
    assert context["generatedAt"] == status["generatedAt"]
    research = context["workspaces"]["预研产品池"]
    assert context["schemaVersion"] == 2
    assert len(research["coreDirections"]) == 10
    assert all(item["lifecycleState"] for item in research["coreDirections"])
    assert research["modelCalibration"]["modelVersion"] == "theme-lifecycle-calibration-v1"
    assert context["workspaces"]["公募基金简报"]["comparableProductCount"] > 1000


def test_every_data_writer_rebuilds_and_commits_agent_context():
    for name in ("update-active-funds.yml", "update-social-attention.yml"):
        workflow = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
        assert "node scripts/build_agent_context.mjs" in workflow
        assert "public/agent_context.json" in workflow
        assert "validate_published_freshness.py public/agent_context.json" in workflow
