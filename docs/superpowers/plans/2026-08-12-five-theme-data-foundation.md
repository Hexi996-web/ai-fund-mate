# Five-Theme Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为黄金、AI与半导体、红利、债券、港股科技建立免费公开数据底座，使每条指标、政策和主题基金关联都可采集、校验、追溯、重跑并通过同域静态数据供后续研究引擎和前端使用。

**Architecture:** 新增独立Python数据管道，采用“来源目录 → 原始响应快照 → 标准化观测 → 质量校验 → 发布快照”的分层结构。开发与GitHub Actions阶段使用SQLite保存结构化状态，并通过清晰的repository接口隔离存储实现，后续可替换为中国大陆PostgreSQL；浏览器只读取同域发布JSON，不直接请求境外数据源。每个采集器遵循统一协议，失败只影响自身来源并在质量日志中显式降级。

**Tech Stack:** Python 3.12、SQLite、requests、BeautifulSoup4、pandas、AkShare、pytest、JSON Schema、GitHub Actions、现有React/Vite静态发布。

## Global Constraints

- 第一阶段只覆盖黄金、AI与半导体、红利、债券、港股科技。
- 每个主题至少配置五项核心指标；无法取得可靠免费数据时保存“缺失”或“来源不可用”，不得生成或插值冒充真实观测。
- 来源优先级固定为：官方原文；官方指数/公共机构；公开适配层；媒体线索。
- 每条观测或文档至少保存 `source_name`、`source_url`、`published_at`、`effective_date`、`collected_at`、`quality_status`。
- 质量状态只允许 `normal`、`stale`、`missing`、`conflict`、`parse_failed`、`source_unavailable`、`human_confirmed`；界面层再映射为中文。
- 原始响应必须先落盘再标准化；文件名使用内容SHA-256，重复运行不得创建逻辑重复观测。
- ETF份额推算资金流必须标记 `is_estimate=true`，不得命名为真实净流入。
- 单一来源失败不得阻塞其他来源、主题或最终降级快照发布。
- 所有HTTP请求必须有超时、有限重试、明确User-Agent和来源级限速。
- 用户浏览器不得直接访问GitHub Pages、海外行情或海外AI接口；发布数据位于同域 `/data/five-themes/`。
- 不修改现有 `public/funds_active.json`、`public/funds_excluded.json` 的契约。
- 本计划不实现五证评分、预测、LLM总结、登录和生产境内部署。
- 新增Python源文件和JSON一律UTF-8；测试不得依赖实时网络。

---

## File Map

- Create `requirements-data.txt`: 数据管道固定依赖及版本下限。
- Create `data_pipeline/__init__.py`: Python包入口。
- Create `data_pipeline/domain.py`: 主题、质量状态、来源、指标、观测和采集结果的数据类型。
- Create `data_pipeline/catalog.py`: 加载并验证来源与指标目录。
- Create `data_pipeline/storage.py`: SQLite schema、幂等写入、查询和运行状态repository。
- Create `data_pipeline/http.py`: 超时、重试、限速和响应元数据封装。
- Create `data_pipeline/raw_store.py`: 基于SHA-256的原始响应归档。
- Create `data_pipeline/quality.py`: 缺失、陈旧、重复、范围及双源冲突校验。
- Create `data_pipeline/collectors/base.py`: 统一采集器协议和注册表。
- Create `data_pipeline/collectors/domestic_market.py`: 境内市场、指数、ETF及汇率适配器。
- Create `data_pipeline/collectors/macro_policy.py`: 央行、统计、政策文档和债券曲线适配器。
- Create `data_pipeline/collectors/overseas_public.py`: 黄金、美元、实际利率及海外公开指标服务端适配器。
- Create `data_pipeline/fund_theme.py`: 五主题基金规则关联及人工覆盖。
- Create `data_pipeline/publish.py`: 生成前端同域主题数据和运行状态JSON。
- Create `data_pipeline/cli.py`: `catalog-check`、`collect`、`quality-check`、`link-funds`、`publish`命令。
- Create `config/five_theme_sources.json`: 来源、频率、超时、限速和主备关系。
- Create `config/five_theme_indicators.json`: 五主题最小指标目录及质量规则。
- Create `config/fund_theme_rules.json`: 可解释的基金主题匹配规则。
- Create `config/fund_theme_overrides.json`: 人工纳入/排除覆盖，初始为空。
- Create `tests/data_pipeline/`: 对上述模块的离线单元和契约测试。
- Create `tests/fixtures/data_sources/`: 小型、脱敏、固定的HTML/JSON/CSV/XML样本。
- Create `scripts/run_five_theme_pipeline.py`: CI和人工执行入口。
- Create `.github/workflows/update-five-theme-data.yml`: 每日更新、校验和发布。
- Create `public/data/five-themes/.gitkeep`: 同域发布目录占位。
- Modify `.gitignore`: 忽略SQLite、原始响应和临时运行目录，不忽略发布JSON。
- Modify `docs/five-theme-mvp.md`: 仅追加本数据底座的实现引用和数据边界说明。

### Task 1: Freeze the source and indicator contracts

**Files:**
- Create: `requirements-data.txt`
- Create: `config/five_theme_sources.json`
- Create: `config/five_theme_indicators.json`
- Create: `data_pipeline/__init__.py`
- Create: `data_pipeline/domain.py`
- Create: `data_pipeline/catalog.py`
- Test: `tests/data_pipeline/test_catalog.py`

**Interfaces:**
- Produces: `load_source_catalog(path: Path) -> dict[str, SourceSpec]`.
- Produces: `load_indicator_catalog(path: Path, sources: Mapping[str, SourceSpec]) -> dict[str, IndicatorSpec]`.
- `SourceSpec` fields: `id,name,url,authority_level,region,frequency,timeout_seconds,max_retries,min_interval_seconds,enabled`.
- `IndicatorSpec` fields: `id,theme,evidence_type,name,unit,frequency,primary_source,backup_sources,stale_after_hours,validation,is_estimate`.

- [ ] **Step 1: Add pinned data dependencies**

Write `requirements-data.txt` with compatible-release pins for `requests`, `beautifulsoup4`, `pandas`, `akshare`, `jsonschema`, and `pytest`. Do not add database servers, browser drivers or LLM SDKs.

- [ ] **Step 2: Write failing catalog tests**

```python
def test_catalog_contains_five_themes_and_at_least_five_indicators_each(tmp_path):
    sources = load_source_catalog(Path("config/five_theme_sources.json"))
    indicators = load_indicator_catalog(Path("config/five_theme_indicators.json"), sources)
    counts = Counter(item.theme.value for item in indicators.values())
    assert counts == {
        "gold": 5, "ai_semiconductor": 5, "dividend": 5,
        "bond": 5, "hong_kong_tech": 5,
    }

def test_indicator_rejects_unknown_source(tmp_path):
    path = write_indicator_fixture(tmp_path, primary_source="not-registered")
    with pytest.raises(CatalogError, match="not-registered"):
        load_indicator_catalog(path, {})
```

- [ ] **Step 3: Run the tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_catalog.py -q`
Expected: FAIL because `data_pipeline.catalog` does not exist.

- [ ] **Step 4: Implement typed domain values and strict catalog validation**

Use `Enum` for the five theme IDs, five evidence types and seven quality statuses. Use frozen dataclasses for `SourceSpec` and `IndicatorSpec`. Reject duplicate IDs, unknown themes, unknown sources, invalid URLs, non-positive timeouts, missing units and empty validation rules.

- [ ] **Step 5: Define exactly 25 MVP indicators**

Configure five indicators per theme:

```text
gold: gold_price_cny, usd_cny, us_real_yield_10y, domestic_gold_etf_share, central_bank_gold
ai_semiconductor: semiconductor_index, semiconductor_etf_share, integrated_circuit_output, semiconductor_sales, ai_semiconductor_policy
dividend: dividend_index, dividend_yield, cn_govt_yield_10y, dividend_etf_share, dividend_policy
bond: cn_yield_curve, repo_rate, social_financing, m1_m2, bond_etf_share
hong_kong_tech: hstech_index, hstech_valuation, southbound_turnover, usd_cny, hstech_etf_share
```

Shared indicators such as `usd_cny` may be referenced by multiple themes but count in each theme mapping. The catalog must state official preferred sources and clearly identified auxiliary backups; do not claim an undocumented API is official.

- [ ] **Step 6: Run catalog tests**

Run: `python -m pytest tests/data_pipeline/test_catalog.py -q`
Expected: all tests PASS and every source reference resolves.

- [ ] **Step 7: Commit**

```powershell
git add requirements-data.txt config/five_theme_sources.json config/five_theme_indicators.json data_pipeline/__init__.py data_pipeline/domain.py data_pipeline/catalog.py tests/data_pipeline/test_catalog.py
git commit -m "feat: define five-theme data catalog"
```

### Task 2: Add raw snapshots and durable SQLite storage

**Files:**
- Create: `data_pipeline/raw_store.py`
- Create: `data_pipeline/storage.py`
- Test: `tests/data_pipeline/test_raw_store.py`
- Test: `tests/data_pipeline/test_storage.py`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `RawSnapshotStore(root).save(source_id, collected_at, content, content_type) -> RawSnapshot`.
- Produces: `DataRepository(db_path).initialize()`.
- Produces: `start_run(command, started_at) -> run_id`, `finish_run(run_id,status,summary)`.
- Produces: `upsert_observations(observations) -> UpsertStats`, `record_quality_events(events)`, `latest_observations()`.

- [ ] **Step 1: Write failing content-addressed snapshot tests**

Assert that identical bytes produce one file and the same SHA-256, different bytes produce different files, metadata records the source and content type, and path components cannot escape the configured root.

- [ ] **Step 2: Write failing SQLite migration and idempotency tests**

Initialize a temporary database twice. Assert tables `sources`, `indicators`, `raw_snapshots`, `observations`, `documents`, `quality_events`, `pipeline_runs`, `fund_theme_links` exist. Insert the same observation twice and assert one logical row keyed by `(indicator_id,effective_date,source_id,dimension_key)`.

- [ ] **Step 3: Run storage tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_raw_store.py tests/data_pipeline/test_storage.py -q`
Expected: FAIL because storage modules do not exist.

- [ ] **Step 4: Implement the raw store**

Store bytes under `<root>/<source_id>/<yyyy>/<mm>/<sha256>.<ext>` and write sidecar JSON atomically. Validate `source_id` against `^[a-z0-9_]+$`; derive extension only from an allowlist of content types.

- [ ] **Step 5: Implement versioned SQLite schema and repository**

Use `PRAGMA user_version=1`, foreign keys, WAL mode and transactions. Store numeric values separately from text values, preserve `unit`, `is_estimate`, `raw_snapshot_sha256`, all six provenance timestamps/fields, and quality status. Repository methods accept domain objects rather than SQL dictionaries.

- [ ] **Step 6: Ignore runtime data safely**

Add only `/var/`, `*.sqlite3`, `*.sqlite3-shm`, and `*.sqlite3-wal` to `.gitignore`. Do not alter or remove the user's existing ignore entry.

- [ ] **Step 7: Run storage tests**

Run: `python -m pytest tests/data_pipeline/test_raw_store.py tests/data_pipeline/test_storage.py -q`
Expected: all tests PASS, including repeated initialization and duplicate ingestion.

- [ ] **Step 8: Commit**

```powershell
git add .gitignore data_pipeline/raw_store.py data_pipeline/storage.py tests/data_pipeline/test_raw_store.py tests/data_pipeline/test_storage.py
git commit -m "feat: add traceable data storage"
```

### Task 3: Build the resilient collector runtime

**Files:**
- Create: `data_pipeline/http.py`
- Create: `data_pipeline/collectors/__init__.py`
- Create: `data_pipeline/collectors/base.py`
- Test: `tests/data_pipeline/test_http.py`
- Test: `tests/data_pipeline/test_collector_runtime.py`

**Interfaces:**
- Produces: `HttpClient.get(source: SourceSpec, *, params=None) -> HttpPayload`.
- Defines: `Collector.fetch(context) -> RawCollection`, `Collector.normalize(raw) -> list[Observation | Document]`, `Collector.validate(records) -> list[QualityEvent]`.
- Produces: `CollectorRegistry.register(source_id, collector_factory)` and `run_collectors(source_ids, context) -> RunSummary`.

- [ ] **Step 1: Write failing retry and timeout tests with fake sessions**

Cover one retry after HTTP 503, no retry after HTTP 404, timeout classification as `source_unavailable`, configured User-Agent, and minimum interval enforcement without real sleeping by injecting clock and sleeper functions.

- [ ] **Step 2: Write failing isolation tests**

Register one successful, one parsing-failure and one network-failure collector. Assert the run summary contains all three results, successful observations remain writable, and the two failures produce quality events rather than raising from the whole run.

- [ ] **Step 3: Run tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_http.py tests/data_pipeline/test_collector_runtime.py -q`
Expected: FAIL because collector runtime does not exist.

- [ ] **Step 4: Implement bounded HTTP behavior**

Retry only timeouts, connection errors, HTTP 429 and 5xx up to `max_retries`; honor integer `Retry-After` capped at 30 seconds; cap response size at 20MB; never log query-string secrets or response bodies.

- [ ] **Step 5: Implement fetch-normalize-validate-save orchestration**

Always save a successful HTTP response to `RawSnapshotStore` before normalization. Catch errors at source boundary, record `parse_failed` or `source_unavailable`, update `pipeline_runs`, and continue. A run exits nonzero only when catalog/storage initialization fails or zero enabled sources produce a usable or explicitly missing result.

- [ ] **Step 6: Run runtime tests**

Run: `python -m pytest tests/data_pipeline/test_http.py tests/data_pipeline/test_collector_runtime.py -q`
Expected: all tests PASS without network access.

- [ ] **Step 7: Commit**

```powershell
git add data_pipeline/http.py data_pipeline/collectors tests/data_pipeline/test_http.py tests/data_pipeline/test_collector_runtime.py
git commit -m "feat: add resilient collector runtime"
```

### Task 4: Implement domestic official and auxiliary collectors

**Files:**
- Create: `data_pipeline/collectors/domestic_market.py`
- Create: `data_pipeline/collectors/macro_policy.py`
- Create fixtures: `tests/fixtures/data_sources/domestic/`
- Test: `tests/data_pipeline/test_domestic_collectors.py`

**Interfaces:**
- Produces collectors registered for domestic index/ETF snapshots, CNY exchange rate, PBOC/NBS macro tables, ChinaBond yield curve, and official policy documents.
- Every normalized record uses catalog indicator IDs and includes `raw_snapshot_sha256`.

- [ ] **Step 1: Add minimal saved fixtures**

Create small fixture excerpts representing: exchange/index JSON, ETF table HTML, PBOC/NBS table, ChinaBond yield curve HTML/JSON, and CSRC/PBOC policy page. Add adjacent metadata JSON containing original URL, retrieval date and content type. Do not commit full third-party datasets.

- [ ] **Step 2: Write failing parser contract tests**

For each fixture assert exact indicator ID, date, value, unit, provenance and quality status. Include tests for reordered HTML columns, `--` values, duplicate rows and a changed/missing required column producing `parse_failed`.

- [ ] **Step 3: Run parser tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_domestic_collectors.py -q`
Expected: FAIL because domestic collectors do not exist.

- [ ] **Step 4: Implement domestic market parsers**

Use official exchange/index endpoints when documented. Where AkShare is the practical free adapter, set authority level to auxiliary, preserve the upstream name/URL, and never rewrite it as an official direct source. Normalize ETF share, amount, price and date without deriving net flow in this task.

- [ ] **Step 5: Implement macro, yield and policy parsers**

Parse PBOC/NBS macro observations, ChinaBond yield-curve tenors, and policy metadata/body. Store policy documents separately from numeric observations; strip scripts/navigation but retain paragraph text and original URL. A missing release date is `missing`, not collection time.

- [ ] **Step 6: Run domestic collector tests**

Run: `python -m pytest tests/data_pipeline/test_domestic_collectors.py -q`
Expected: all fixture tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add data_pipeline/collectors/domestic_market.py data_pipeline/collectors/macro_policy.py tests/fixtures/data_sources/domestic tests/data_pipeline/test_domestic_collectors.py
git commit -m "feat: collect domestic theme evidence"
```

### Task 5: Implement overseas public-data collectors behind the server boundary

**Files:**
- Create: `data_pipeline/collectors/overseas_public.py`
- Create fixtures: `tests/fixtures/data_sources/overseas/`
- Test: `tests/data_pipeline/test_overseas_collectors.py`

**Interfaces:**
- Produces normalized observations for gold price, USD/CNY backup, US 10-year real yield, global semiconductor sales backup and overseas market indicators explicitly present in the catalog.
- No URL from this module is emitted as a browser runtime dependency; it is provenance only.

- [ ] **Step 1: Add small public-data fixtures and metadata**

Use fixed CSV/JSON fixture excerpts from documented public endpoints such as FRED or another cataloged public institution. Metadata must state whether redistribution permits committing the excerpt; otherwise create hand-authored schema-equivalent fixtures and label them synthetic parser fixtures, never production data.

- [ ] **Step 2: Write failing normalization tests**

Assert date parsing, missing-value handling, units, source identity, and that `effective_date` comes from the dataset rather than HTTP collection time.

- [ ] **Step 3: Run tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_overseas_collectors.py -q`
Expected: FAIL because overseas collector module does not exist.

- [ ] **Step 4: Implement server-only public adapters**

Require any API token through environment variables named in source config; a missing optional token produces `source_unavailable` and permits backup use. Do not expose tokens or make frontend code call these endpoints. Preserve the most recent valid observation for degraded publishing.

- [ ] **Step 5: Test blocked-source degradation**

Simulate DNS/timeout failure and assert the last valid stored observation is retained with `stale`, the current source event is `source_unavailable`, and no new numeric value is fabricated.

- [ ] **Step 6: Run overseas tests**

Run: `python -m pytest tests/data_pipeline/test_overseas_collectors.py -q`
Expected: all tests PASS offline.

- [ ] **Step 7: Commit**

```powershell
git add data_pipeline/collectors/overseas_public.py tests/fixtures/data_sources/overseas tests/data_pipeline/test_overseas_collectors.py
git commit -m "feat: collect server-side overseas indicators"
```

### Task 6: Add quality evaluation and cross-source conflicts

**Files:**
- Create: `data_pipeline/quality.py`
- Test: `tests/data_pipeline/test_quality.py`

**Interfaces:**
- Produces: `evaluate_observation(observation, indicator, now) -> list[QualityEvent]`.
- Produces: `compare_primary_backup(primary, backup, indicator) -> QualityEvent | None`.
- Produces: `quality_summary(repository, run_id) -> QualitySummary`.

- [ ] **Step 1: Write failing rule tests**

Cover stale threshold, missing value, numeric min/max, allowed text values, duplicate identity, percent-vs-decimal unit mistake and configurable primary/backup tolerance. Assert important conflicting observations remain stored and both receive `conflict` rather than one silently overwriting the other.

- [ ] **Step 2: Run tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_quality.py -q`
Expected: FAIL because quality functions do not exist.

- [ ] **Step 3: Implement deterministic quality rules**

Rules read only from `IndicatorSpec.validation`. Severity is `info`, `warning` or `error`; quality status follows the seven-value enum. Do not calculate research scores or sentiment.

- [ ] **Step 4: Implement publish eligibility**

An observation is current-publishable only when `normal` or `human_confirmed`. A stale last-valid observation may be included under `last_valid` with its original date and `stale`; `missing`, `conflict`, `parse_failed` and `source_unavailable` never become a current numeric value.

- [ ] **Step 5: Run quality tests**

Run: `python -m pytest tests/data_pipeline/test_quality.py -q`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add data_pipeline/quality.py tests/data_pipeline/test_quality.py
git commit -m "feat: add data quality evaluation"
```

### Task 7: Link the existing fund catalog to five themes

**Files:**
- Create: `config/fund_theme_rules.json`
- Create: `config/fund_theme_overrides.json`
- Create: `data_pipeline/fund_theme.py`
- Test: `tests/data_pipeline/test_fund_theme.py`

**Interfaces:**
- Produces: `link_funds(funds_payload, rules, overrides) -> list[FundThemeLink]`.
- `FundThemeLink` fields: `fund_code,theme,match_type,matched_rule,confidence,review_status`.

- [ ] **Step 1: Write failing conservative matching tests**

Use small fund fixtures covering 华安黄金ETF、半导体ETF、红利低波ETF、纯债基金、恒生科技ETF and ambiguous names. Assert exact inclusion, exclusion, no substring false positive for unrelated names, and A/C share codes remain separate.

- [ ] **Step 2: Run tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_fund_theme.py -q`
Expected: FAIL because linker does not exist.

- [ ] **Step 3: Implement explainable rule matching**

Rules support normalized exact terms, required-all terms, required-any terms and excluded terms against name/type only. Do not infer holdings from a generic fund name. Every match stores the rule ID and confidence; ambiguous matches are `needs_review` and excluded from product counts by default.

- [ ] **Step 4: Implement manual overrides**

Overrides require `fund_code`, `theme`, `action`, `reason`, `reviewed_by`, `reviewed_at`. An empty array is valid. Inclusion/exclusion overrides win over rules and remain auditable.

- [ ] **Step 5: Run linker tests against a bounded real snapshot sample**

Read `public/funds_active.json`, assert the command completes deterministically, every linked code exists in the snapshot, and no fund-theme pair is duplicated. Do not assert volatile total counts.

- [ ] **Step 6: Commit**

```powershell
git add config/fund_theme_rules.json config/fund_theme_overrides.json data_pipeline/fund_theme.py tests/data_pipeline/test_fund_theme.py
git commit -m "feat: link funds to five themes"
```

### Task 8: Publish a stable same-origin data contract and CLI

**Files:**
- Create: `data_pipeline/publish.py`
- Create: `data_pipeline/cli.py`
- Create: `scripts/run_five_theme_pipeline.py`
- Create: `public/data/five-themes/.gitkeep`
- Test: `tests/data_pipeline/test_publish.py`
- Test: `tests/data_pipeline/test_cli.py`

**Interfaces:**
- CLI commands: `catalog-check`, `collect --source <id>|--all`, `quality-check`, `link-funds`, `publish`, `run-daily`.
- Publishes: `public/data/five-themes/manifest.json`, `themes.json`, `observations.json`, `documents.json`, `fund-links.json`, `quality.json`.

- [ ] **Step 1: Write failing publication schema tests**

Assert `schemaVersion=1`, generated timestamp, five themes, source provenance, current versus last-valid separation, quality summary, sorted deterministic arrays and no secrets/local filesystem paths. Assert a second publish from identical database state produces identical content except `generatedAt` when explicitly supplied.

- [ ] **Step 2: Write failing CLI exit-code tests**

Use temporary config/database/raw/public paths. Assert invalid catalog exits 2, partial source failure with usable degraded output exits 0 and records warnings, storage failure exits 1, and `run-daily` executes collect → quality → link → publish.

- [ ] **Step 3: Run tests and verify failure**

Run: `python -m pytest tests/data_pipeline/test_publish.py tests/data_pipeline/test_cli.py -q`
Expected: FAIL because publisher and CLI do not exist.

- [ ] **Step 4: Implement atomic deterministic publishing**

Write to a temporary sibling file, flush, then replace the target. JSON uses UTF-8, stable keys and compact separators. Never publish raw response bodies; publish original URLs only as provenance.

- [ ] **Step 5: Implement the CLI and script entrypoint**

Default runtime paths are `var/five_themes.sqlite3`, `var/raw/` and `public/data/five-themes/`; every path is overrideable for tests. Log one JSON object per line with run/source/status/count/duration, never credentials.

- [ ] **Step 6: Run publication and CLI tests**

Run: `python -m pytest tests/data_pipeline/test_publish.py tests/data_pipeline/test_cli.py -q`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add data_pipeline/publish.py data_pipeline/cli.py scripts/run_five_theme_pipeline.py public/data/five-themes/.gitkeep tests/data_pipeline/test_publish.py tests/data_pipeline/test_cli.py
git commit -m "feat: publish five-theme data snapshots"
```

### Task 9: Automate daily collection without breaking the current fund update

**Files:**
- Create: `.github/workflows/update-five-theme-data.yml`
- Modify: `docs/five-theme-mvp.md`
- Test: `tests/data_pipeline/test_workflow_contract.py`

**Interfaces:**
- Consumes: `python scripts/run_five_theme_pipeline.py run-daily`.
- Produces: committed files under `public/data/five-themes/` and uploaded diagnostic artifacts for failed/degraded runs.

- [ ] **Step 1: Write a failing workflow contract test**

Parse the workflow as text/YAML and assert: daily cron plus `workflow_dispatch`; Python 3.12; install from `requirements-data.txt`; run catalog validation before collection; use `concurrency`; upload quality/log artifacts with `if: always()`; commit only `public/data/five-themes/*.json`; no `git add .`; no browser-visible secret.

- [ ] **Step 2: Run the workflow test and verify failure**

Run: `python -m pytest tests/data_pipeline/test_workflow_contract.py -q`
Expected: FAIL because workflow does not exist.

- [ ] **Step 3: Implement the independent workflow**

Schedule after the existing active-fund job. Restore/save the ignored SQLite and raw snapshot cache through GitHub Actions cache using catalog hash and date; treat cache as an optimization, not the only durable published output. A degraded run publishes explicit quality status; a fatal catalog/storage failure does not commit new snapshots.

- [ ] **Step 4: Add data-foundation documentation link**

Append a short “实施文档” section to `docs/five-theme-mvp.md` linking this plan. State that GitHub Actions is development/MVP scheduling and that final mainland production scheduling will move to a mainland-accessible runner in subproject 4.

- [ ] **Step 5: Run workflow and all pipeline tests**

Run: `python -m pytest tests/data_pipeline -q`
Expected: all tests PASS without live network.

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/update-five-theme-data.yml docs/five-theme-mvp.md tests/data_pipeline/test_workflow_contract.py
git commit -m "ci: automate five-theme data updates"
```

### Task 10: Verify the data foundation end to end

**Files:**
- Verify: all files introduced in Tasks 1–9.
- Do not modify: `src/App.jsx`, existing fund JSON contracts or production deployment settings unless a test proves an integration defect in this subproject.

**Interfaces:**
- Produces: reproducible test evidence, one fixture-backed published snapshot and a documented live-source smoke result.

- [ ] **Step 1: Run the complete offline test suite**

Run: `python -m pytest tests/data_pipeline -q`
Expected: all data-pipeline tests PASS without network.

Run: `python -m unittest scripts/test_update_active_funds.py`
Expected: existing fund updater tests PASS.

Run: `node --test src/data/*.test.js`
Expected: existing frontend data tests PASS.

- [ ] **Step 2: Run a fixture-backed end-to-end pipeline**

Run the CLI with temporary fixture config, database, raw and publish paths. Expected: five themes in manifest, at least five configured indicators per theme, provenance on every record, explicit missing/degraded states, no duplicate logical observations and no network access.

- [ ] **Step 3: Run production build**

Run: `npm.cmd run build`
Expected: Vite exits 0 and existing application remains buildable.

- [ ] **Step 4: Run opt-in live smoke collection**

Run one source at a time with an explicit `--live` guard and no write to committed publish files. Record source ID, HTTP/result status, parsed count, effective date and quality state. Network failure is reported as `source_unavailable`; it is not disguised as success and does not invalidate offline parser verification.

- [ ] **Step 5: Check mainland-browser dependency boundary**

Search `src/`, `index.html` and published JSON. Expected: no new runtime `fetch` to overseas sources, GitHub Pages or Vercel-only APIs; overseas URLs appear only as provenance in same-origin JSON.

- [ ] **Step 6: Run repository checks**

Run: `git diff --check`
Expected: no whitespace errors.

Run: `git status --short`
Expected: only intentional data-foundation files plus the user's pre-existing unrelated changes.

- [ ] **Step 7: Commit verification fixes only if needed**

```powershell
git add data_pipeline config scripts tests/data_pipeline .github/workflows/update-five-theme-data.yml public/data/five-themes docs/five-theme-mvp.md requirements-data.txt
git commit -m "fix: resolve data foundation verification findings"
```

Do not use broad staging when unrelated user changes    present.

## Definition of Done

- 五主题均配置至少五项核心指标，并具有主源、备用源、频率、单位、陈旧阈值和校验规则。
- 采集器遵循统一接口，原始响应、标准化观测和质量事件可相互追溯。
- 重复运行幂等；单源失败不阻塞其他来源；陈旧和缺失不会被解释为中性或当前值。
- 政策原文、数字观测和媒体线索在数据模型中分离。
- 现有基金快照可生成可解释、可人工覆盖的五主题关联。
- 同域JSON发布契约稳定且不泄露密钥、本地路径或原始响应正文。
- 浏览器不直接依赖境外数据服务，符合后续中国大陆无需VPN生产化的架构边界。
- 所有离线测试、现有基金测试和Vite生产构建通过。
- 实时源可用性不作为解析器测试的替代；所有实时失败都有准确质量状态。
