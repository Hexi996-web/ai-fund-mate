"""Bridge direct scripts execution to the repository data_pipeline package."""
from pathlib import Path

__path__.append(str(Path(__file__).resolve().parents[2] / "data_pipeline"))
