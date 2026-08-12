import subprocess
import sys

def test_script_entrypoint_imports_repository_package():
    result=subprocess.run([sys.executable,"scripts/run_five_theme_pipeline.py","catalog-check"],capture_output=True,text=True)
    assert result.returncode == 0, result.stderr
