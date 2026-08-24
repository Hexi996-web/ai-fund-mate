"""One-time, resumable backfill of 2025 year-end scale and 2026 NAV metrics.

The public EastMoney product JavaScript contains a fund's reported scale series
and adjusted cumulative-NAV series. This command fetches one representative
share per product, computes the requested 2026 metrics, and atomically enriches
``public/fund_products.json``. It never replaces the file when coverage is below
the configured quality floor.
"""

from __future__ import annotations

import argparse
import http.client
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_PATH = ROOT / "public" / "fund_products.json"
CACHE_PATH = ROOT / ".tmp" / "fund-metrics-2026-unit-nav-v2.json"
TARGET_YEAR = 2026
SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
SCALE_PATTERN = re.compile(r"Data_fluctuationScale\s*=\s*(\{.*?\});")
ADJUSTED_NAV_PATTERN = re.compile(r"Data_ACWorthTrend\s*=\s*(\[.*?\]);")
UNIT_NAV_PATTERN = re.compile(r"Data_netWorthTrend\s*=\s*(\[.*?\]);")


def _date_from_millis(value) -> str:
    return datetime.fromtimestamp(float(value) / 1000, SHANGHAI_TZ).date().isoformat()


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
    # Daily snapshots expose unit NAV, so the historical baseline must use the
    # same series. Mixing adjusted/cumulative NAV with unit NAV can create a
    # 100x discontinuity for exchange-traded bond funds.
    nav = _series(content, UNIT_NAV_PATTERN) or _series(content, ADJUSTED_NAV_PATTERN)
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
            "baselineNavDate": first_date,
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
        except (OSError, ValueError, json.JSONDecodeError, http.client.IncompleteRead):
            if attempt + 1 < attempts:
                time.sleep(0.4 * (attempt + 1))
    return code, None


def load_cache() -> dict[str, dict]:
    candidates = (CACHE_PATH.with_suffix(".tmp"), CACHE_PATH)
    valid = []
    for path in candidates:
        if not path.exists():
            continue
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                valid.append(value)
        except (OSError, json.JSONDecodeError):
            continue
    return max(valid, key=len, default={})


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CACHE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for attempt in range(5):
        try:
            temporary.replace(CACHE_PATH)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.25 * (attempt + 1))


NAV_FIELDS = (
    "representativeNav", "ytdStartNav", "baselineNavDate", "baselineNavType",
    "navGrowthPercent", "ytdPeakNav", "maxDrawdownPercent", "drawdownStartDate",
    "drawdownEndDate", "metricsCoverageStart", "metricsAsOf", "metricsCoverage",
)


def backfill(workers: int = 24, limit: int | None = None, min_coverage: float = 0.75, missing_baseline_only: bool = False) -> dict:
    payload = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    products = payload.get("products", [])
    targets = [product for product in products if not missing_baseline_only or product.get("baselineScaleYi") is None]
    codes = [str(product.get("representativeCode", "")).zfill(6) for product in targets]
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
    target_ids = {product.get("productId") for product in targets}
    for product in products:
        if product.get("productId") not in target_ids:
            continue
        metrics = cache.get(str(product.get("representativeCode", "")).zfill(6))
        if str(product.get("type") or "").startswith("货币"):
            metrics = dict(metrics or {})
            for field in NAV_FIELDS:
                metrics.pop(field, None)
        if metrics:
            established_date = str(product.get("establishedDate") or "")
            metrics["baselineNavType"] = "成立" if established_date.startswith(f"{TARGET_YEAR}-") else "年初"
            product.update(metrics)
        else:
            # Never retain a metric from an older, incompatible NAV series when
            # the same-unit historical series could not be refreshed.
            for field in NAV_FIELDS:
                product[field] = None
        if str(product.get("type") or "").startswith("货币"):
            for field in NAV_FIELDS:
                product[field] = None
    payload["metricsBackfill"] = {
        "targetYear": TARGET_YEAR,
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "coveredProducts": covered,
        "totalProducts": len(codes),
        "coveragePercent": round(coverage * 100, 2),
        "mode": "missing-baseline-only" if missing_baseline_only else "all-products",
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
    parser.add_argument("--missing-baseline-only", action="store_true")
    args = parser.parse_args()
    print(json.dumps(backfill(args.workers, args.limit, args.min_coverage, args.missing_baseline_only), ensure_ascii=False))


if __name__ == "__main__":
    main()
