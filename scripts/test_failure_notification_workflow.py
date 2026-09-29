from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_blocking_workflows_create_github_issue_alerts():
    workflow = (ROOT / ".github/workflows/notify-workflow-failure.yml").read_text(encoding="utf-8")
    for name in (
        "Update active fund data", "Update social attention history",
        "Update slow external signals", "Deploy production to Aliyun ECS",
        "Guard published data freshness",
    ):
        assert f"- {name}" in workflow
    assert "issues: write" in workflow
    assert "conclusion == 'failure'" in workflow
    assert "issues.create" in workflow
    assert "assignees: [owner]" in workflow
