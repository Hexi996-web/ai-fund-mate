from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_ecs_deployment_retries_transient_ssh_failures():
    workflow = (ROOT / ".github/workflows/deploy-ecs.yml").read_text(encoding="utf-8")
    assert "ServerAliveInterval=30" in workflow
    assert "ServerAliveCountMax=3" in workflow
    assert workflow.count("for attempt in 1 2 3") == 2
    assert "flock -w 600 /tmp/ai-fund-mate-deploy.lock" in workflow
    assert 'remote_archive="/tmp/ai-fund-mate-release-$GITHUB_SHA.tar.gz"' in workflow


def test_ecs_activation_uses_the_unique_archive_idempotently():
    script = (ROOT / "scripts/deploy_ecs.sh").read_text(encoding="utf-8")
    assert 'RELEASE_ARCHIVE="${RELEASE_ARCHIVE:-/tmp/ai-fund-mate-release.tar.gz}"' in script
    assert 'test -s "$RELEASE_ARCHIVE"' in script
    assert 'tar -xzf "$RELEASE_ARCHIVE"' in script
    assert 'rm -f "$RELEASE_ARCHIVE"' not in script
