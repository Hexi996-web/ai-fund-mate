"""One-time, resumable backfill of 2025 year-end scale and 2026 NAV metrics.

The public EastMoney product JavaScript contains a fund's reported scale series
and adjusted cumulative-NAV series. This command fetches one representative
share per product, computes the requested 2026 metrics, and atomically enriches
``public/fund_products.json``. It never replaces the file when coverage is below
the configured quality floor.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_PATH = ROOT / "public" / "fund_products.json"
CACHE_PATH = ROOT / ".tmp" / "fund-metrics-2026-backfill.json"
TARGET_YEAR = 2026
SCALE_PATTERN = re.compile(r"Data_fluctuationScale\s*=\s*(\{.*?\});")
ADJUSTED_NAV_PATTERN = re.compile(r"Data_ACWorthTrend\s*=\s*(\[.*?\]);")
UNIT_NAV_PATTERN = re.compile(r"Data_netWorthTrend\s*=\s*(\[.*?\]);")


def _date_from_millis(value) -> str:
    return datetime.fromtimestamp(float(value) / 1000, timezone.utc).date().isoformat()


def _series(content: str, pattern: re.Pattern) -> list[tuple[str, float]]:
    match = pattern.search(content)
    if not match:
        return []
    raw = json.loads(match.group(1))
    points = []
    for point in raw:
        if isinstance(point, list) and len(point) >= 2 and point[1] is not None:
            points.append((_date_from_millis(point[0]), float(point[1])))
        elif isinstance(point, dict) and point.get("x") is not None and point.get("y") is not None:
            points.append((_date_from_millis(point["x"]), float(point["y"])))
    return sorted(set(points))


def _scale_series(content: str) -> list[tuple[str, float]]:
    match = SCALE_PATTERN.search(content)
    if not match:
        return []
    raw = json.loads(match.group(1))
    categories, values = raw.get("categories", []), raw.get("series", [])
    points = []
    for report_date, point in zip(categories, values):
        value = point.get("y") if isinstance(point, dict) else point
        if value is not None:
            points.append((str(report_date), float(value)))
    return sorted(set(points))


def calculate_metrics(content: str) -> dict | None:
    nav = _series(content, ADJUSTED_NAV_PATTERN) or _series(content, UNIT_NAV_PATTERN)
    nav_2026 = [point for point in nav if point[0].startswith(f"{TARGET_YEAR}-")]
    scales = _scale_series(content)
    baseline = [point for point in scales if point[0] <= "2025-12-31"]
    current = [point for point in scales if point[0].startswith(f"{TARGET_YEAR}-")]
    if not nav_2026 and not baseline and not current:
        return None

    result = {"backfillSource": "东方财富/天天基金公开产品页", "backfilledAt": datetime.now(timezone.utc).isoformat()}
    if nav_2026:
        first_date, first_nav = nav_2026[0]
        last_date, last_nav = nav_2026[-1]
        peak_nav, peak_date = nav_2026[0][1], nav_2026[0][0]
        max_drawdown, drawdown_start, drawdown_end = 0.0, peak_date, peak_date
        for point_date, value in nav_2026:
            if value > peak_nav:
                peak_nav, peak_date = value, point_date
            drawdown = (value / peak_nav - 1) * 100 if peak_nav else 0
            if drawdown < max_drawdown:
                max_drawdown, drawdown_start, drawdown_end = drawdown, peak_date, point_date
        result.update({
            "representativeNav": last_nav,
            "ytdStartNav": first_nav,
            "navGrowthPercent": round((last_nav / first_nav - 1) * 100, 4) if first_nav else None,
            "ytdPeakNav": peak_nav,
            "maxDrawdownPercent": round(max_drawdown, 4),
            "drawdownStartDate": drawdown_start,
            "drawdownEndDate": drawdown_end,
            "metricsCoverageStart": first_date,
            "metricsAsOf": last_date,
            "metricsCoverage": "2026年至今（历史回填）",
        })
    if baseline:
        baseline_date, baseline_scale = baseline[-1]
        result.update({
            "baselineScaleYi": baseline_scale,
            "baselineScaleDate": baseline_date,
            "baselineScaleType": "2025年末披露规模",
        })
    if current:
        current_date, current_scale = current[-1]
        result.update({
            "currentScaleYi": current_scale,
            "scaleDate": current_date,
            "scaleStatus": "最近一期正式披露规模",
            "scaleQuality": "R",
        })
        baseline_scale = result.get("baselineScaleYi")
        if baseline_scale is not None:
            increase = round(current_scale - baseline_scale, 4)
            result["scaleNetIncreaseYi"] = increase
            result["scaleGrowthPercent"] = round(increase / baseline_scale * 100, 4) if baseline_scale else None
    return result


def fetch_metrics(code: str, attempts: int = 3) -> tuple[str, dict | None]:
    request = Request(
        f"https://fund.eastmoney.com/pingzhongdata/{code}.js",
        headers={"User-Agent": "Mozilla/5.0 (compatible; AIFundMate/1.0)"},
    )
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=15) as response:
                return code, calculate_metrics(response.read().decode("utf-8", errors="ignore"))
        except (OSError, ValueError, json.JSONDecodeError):
            if attempt + 1 < attempts:
                time.sleep(0.4 * (attempt + 1))
    return code, None


def load_cache() -> dict[str, dict]:
    if not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CACHE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(CACHE_PATH)


def backfill(workers: int = 24, limit: int | None = None, min_coverage: float = 0.75) -> dict:
    payload = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    products = payload.get("products", [])
    codes = [str(product.get("representativeCode", "")).zfill(6) for product in products]
    if limit:
        codes = codes[:limit]
    cache = load_cache()
    pending = [code for code in codes if code not in cache]
    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(fetch_metrics, code) for code in pending]
        for future in as_completed(futures):
            code, metrics = future.result()
            cache[code] = metrics or {}
            completed += 1
            if completed % 250 == 0:
                save_cache(cache)
                print(f"已完成 {completed}/{len(pending)}；累计缓存 {len(cache)}")
    save_cache(cache)

    covered = sum(bool(cache.get(code)) for code in codes)
    coverage = covered / len(codes) if codes else 0
    if coverage < min_coverage:
        raise RuntimeError(f"回填覆盖率 {coverage:.2%} 低于发布门槛 {min_coverage:.2%}，不覆盖产品文件")
    for product in products:
        metrics = cache.get(str(product.get("representativeCode", "")).zfill(6))
        if metrics:
            product.update(metrics)
    payload["metricsBackfill"] = {
        "targetYear": TARGET_YEAR,
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "coveredProducts": covered,
        "totalProducts": len(codes),
        "coveragePercent": round(coverage * 100, 2),
    }
    temporary = PRODUCTS_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    json.loads(temporary.read_text(encoding="utf-8"))
    temporary.replace(PRODUCTS_PATH)
    return payload["metricsBackfill"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--min-coverage", type=float, default=0.75)
    args = parser.parse_args()
    print(json.dumps(backfill(args.workers, args.limit, args.min_coverage), ensure_ascii=False))


if __name__ == "__main__":
    main()
