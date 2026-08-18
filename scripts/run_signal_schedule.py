"""Run the hourly signal pipeline and the Beijing 07:00 daily brief."""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SNAPSHOT = ROOT / "public" / "data" / "signal-radar.json"
SCHEDULE_DB = ROOT / ".tmp" / "signal-schedule.db"


def select_jobs(now_utc: datetime) -> list[str]:
    """Return deterministic jobs for the hourly run containing ``now_utc``.

    GitHub schedules are not guaranteed to start at the exact requested minute,
    so every run during UTC hour 23 includes the idempotent Beijing-date brief.
    """
    if now_utc.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware")
    instant = now_utc.astimezone(UTC)
    if instant.hour == 23:
        return ["collect", "brief", "publish"]
    return ["collect", "publish"]


def run_schedule(now_utc: datetime, output: Path = DEFAULT_SNAPSHOT) -> None:
    """Run selected CLI jobs in order, stopping immediately on failure."""
    instant = now_utc.astimezone(UTC)
    iso_utc = instant.isoformat()
    for job in select_jobs(instant):
        command = [
            sys.executable, "-m", "data_pipeline.signal_cli", job,
            "--db", str(SCHEDULE_DB),
        ]
        if job == "collect":
            command += ["--as-of", iso_utc]
        elif job == "brief":
            command += ["--run-at", iso_utc]
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            command += ["--output", str(output), "--generated-at", iso_utc]
        subprocess.run(command, cwd=ROOT, check=True)


def _timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("timestamp must include a UTC offset")
    return parsed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--now", type=_timestamp, default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_SNAPSHOT)
    args = parser.parse_args(argv)
    run_schedule(args.now or datetime.now(UTC), args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
