import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_agent_context_matches_published_status_and_core_pool():
    status = json.loads((ROOT / "public/data_status.json").read_text(encoding="utf-8"))
    context = json.loads((ROOT / "public/agent_context.json").read_text(encoding="utf-8"))
    assert context["snapshotDate"] == status["snapshotDate"]
    knowledge = context["pageKnowledge"]
    assert "产业核心需求40%" in knowledge["quadrant"]["horizontalAxis"]
    assert "估算资金流35%" in knowledge["rankingRules"]["quarter"]
    assert "龙头企业兑现40%" in knowledge["rankingRules"]["halfYear"]
    assert "资产承载30%" in knowledge["rankingRules"]["year"]
    assert "上一期名次－当前名次" in knowledge["rankingRules"]["arrows"]
    rankings = context["workspaces"]["预研产品池"]["horizonRankings"]
    assert set(rankings) == {"quarter", "halfYear", "year"}
    assert all(len(row["top10"]) == 10 for row in rankings.values())
    assert context["generatedAt"] == status["generatedAt"]
    research = context["workspaces"]["预研产品池"]
    assert context["schemaVersion"] == 2
    assert len(research["coreDirections"]) == 10
    assert all(item["lifecycleState"] for item in research["coreDirections"])
    assert all(item["opportunityScore"] is not None for item in research["coreDirections"])
    assert all(item["opportunityComponents"] is not None for item in research["coreDirections"])
    assert research["modelCalibration"]["modelVersion"] == "theme-lifecycle-calibration-v1"
    assert context["workspaces"]["公募基金简报"]["comparableProductCount"] > 1000


def test_every_data_writer_rebuilds_and_commits_agent_context():
    for name in ("update-active-funds.yml", "update-social-attention.yml"):
        workflow = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
        assert "node scripts/build_agent_context.mjs" in workflow
        assert "public/agent_context.json" in workflow
        assert "validate_published_freshness.py public/agent_context.json" in workflow


def test_every_data_writer_rebuilds_derived_files_after_rebase():
    for name in ("update-active-funds.yml", "update-social-attention.yml", "update-slow-external-signals.yml"):
        workflow = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
        rebase = workflow.index('git pull --rebase -X theirs origin "$GITHUB_REF_NAME"')
        assert workflow.index("python scripts/publish_data_status.py", rebase) > rebase
        assert workflow.index("node scripts/build_agent_context.mjs", rebase) > rebase
        assert workflow.index("node scripts/build_market_forecast_snapshot.mjs", rebase) > rebase
        assert "public/market_forecast.json" in workflow
        assert "s['productsUpdateTime'])==(p['dataDate'],p['updateTime'])" in workflow
