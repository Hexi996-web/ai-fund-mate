# Automated Signal Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static signal demo with an hourly, source-backed signal pipeline and a Beijing-time 08:00 daily brief while preserving the existing theme and fund-product workspaces.

**Architecture:** Extend the existing Python pipeline with a storage-neutral signal domain, rule-based ingestion, clustering, scoring, anomaly detection, catalysts, and briefs. Use SQLite for deterministic local tests and a Supabase PostgreSQL adapter for deployment; GitHub Actions runs hourly ingestion and the daily brief, while the Vite frontend reads a published JSON snapshot first and can later read Supabase through the same response contract.

**Tech Stack:** Python 3.12+, SQLite, PostgreSQL/Supabase, pytest, GitHub Actions, React 18, Vite, Node test runner, Playwright.

## Global Constraints

- Run hourly collection and generate the daily brief at 08:00 Asia/Shanghai for the window `[previous day 08:00, current day 08:00)`.
- Chinese S/A official sources are primary; overseas sources are limited to Fed, BLS, ECB, and BIS information with a clear China-fund transmission path.
- No paid LLM API is required; an absent optional model key must never block collection or publication.
- Non-official anomalies remain labelled `pending_official_validation` and cannot become official facts.
- Real customer demand is high priority; proxies and media attention must remain explicitly distinguishable.
- Never bypass login, CAPTCHA, paywall, robots restrictions, or other access controls.
- Preserve `信号雷达｜主题研判｜基金产品库`, theme-to-fund navigation, product grouping, and representative-share behavior.
- Use red-green-refactor for every behavior change and commit after each independently testable task.

---

## File Map

- `data_pipeline/signal_domain.py`: immutable source, raw item, cluster, signal, evidence, catalyst, and brief records.
- `data_pipeline/signal_storage.py`: SQLite repository and repository protocol used by the pipeline.
- `data_pipeline/supabase_storage.py`: PostgreSQL implementation configured only through environment variables.
- `data_pipeline/source_registry.py`: validated source definitions and source-tier weights.
- `data_pipeline/signal_collectors/`: RSS, ICS, HTML-list, and fixture collectors with no scoring logic.
- `data_pipeline/signal_cluster.py`: URL normalization, content hashing, duplicate detection, and event clustering.
- `data_pipeline/signal_scoring.py`: transparent score components, decay, customer evidence tiers, and priority.
- `data_pipeline/signal_anomaly.py`: 30-day baseline and non-official anomaly ceiling.
- `data_pipeline/signal_rules.py`: category, asset, fund keyword, theme, direction, and horizon extraction.
- `data_pipeline/catalysts.py`: future event normalization and actual-outcome archival.
- `data_pipeline/daily_brief.py`: exact Beijing-time window and two-minute brief payload.
- `data_pipeline/signal_publish.py`: atomic frontend snapshot publication.
- `data_pipeline/signal_cli.py`: `collect`, `brief`, `publish`, and `health` commands.
- `supabase/migrations/202608140001_signal_intelligence.sql`: schema, indexes, grants, and RLS policies.
- `.github/workflows/signal-intelligence.yml`: hourly and daily schedules plus manual dispatch.
- `public/data/signal-radar.json`: deployed snapshot contract and local fallback.
- `src/features/signal-radar/signalApi.js`: fetch, validation, and stale fallback.
- `src/features/signal-radar/`: status, pagination, source badges, score explanation, daily brief, and catalyst UI.
- `tests/data_pipeline/`: Python unit and integration tests.
- `tests/signal-radar-live.spec.js`: frontend contract and browser behavior.

---

### Task 1: Signal Domain and SQLite Repository

**Files:**
- Create: `data_pipeline/signal_domain.py`
- Create: `data_pipeline/signal_storage.py`
- Create: `tests/data_pipeline/test_signal_storage.py`

**Interfaces:**
- Produces: `SourceRecord`, `RawItem`, `EventCluster`, `SignalRecord`, `SignalEvidence`, `CatalystRecord`, `DailyBrief`, `PipelineRun` dataclasses.
- Produces: `SignalRepository(db_path).initialize()`, `.upsert_source()`, `.save_raw_item()`, `.upsert_cluster()`, `.upsert_signal()`, `.replace_signal_evidence()`, `.upsert_catalyst()`, `.save_brief()`, `.record_run()`, and read methods used by later tasks.

- [ ] **Step 1: Write failing repository tests**

```python
def test_raw_items_are_idempotent_by_content_hash(tmp_path):
    repo = SignalRepository(tmp_path / "signals.db")
    repo.initialize()
    first = repo.save_raw_item(sample_raw_item(content_hash="abc"))
    second = repo.save_raw_item(sample_raw_item(content_hash="abc"))
    assert first.id == second.id
    assert repo.count_raw_items() == 1

def test_signal_keeps_separate_score_components(tmp_path):
    repo = initialized_repo(tmp_path)
    repo.upsert_signal(sample_signal(source_confidence=.9, customer_demand_score=1.0))
    row = repo.get_signal("sig-1")
    assert row.source_confidence == .9
    assert row.customer_demand_score == 1.0
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/data_pipeline/test_signal_storage.py -q`
Expected: FAIL because `data_pipeline.signal_storage` does not exist.

- [ ] **Step 3: Implement dataclasses, schema, indexes, transactions, and idempotent upserts**

Use UTC ISO timestamps in storage, explicit enums for `source_tier`, `demand_kind`, `validation_status`, and foreign keys from evidence to signals/raw items. Create indexes on `(published_at)`, `(category, priority DESC)`, `(cluster_id)`, and `(scheduled_at)`.

- [ ] **Step 4: Run repository and existing pipeline tests**

Run: `python -m pytest tests/data_pipeline/test_signal_storage.py tests/data_pipeline/test_storage.py tests/data_pipeline/test_raw_store.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data_pipeline/signal_domain.py data_pipeline/signal_storage.py tests/data_pipeline/test_signal_storage.py
git commit -m "feat: add signal intelligence repository"
```

### Task 2: Source Registry and Safe Collectors

**Files:**
- Create: `config/signal_sources.json`
- Create: `data_pipeline/source_registry.py`
- Create: `data_pipeline/signal_collectors/__init__.py`
- Create: `data_pipeline/signal_collectors/rss.py`
- Create: `data_pipeline/signal_collectors/ics.py`
- Create: `data_pipeline/signal_collectors/html_list.py`
- Create: `tests/data_pipeline/fixtures/signals/`
- Create: `tests/data_pipeline/test_signal_collectors.py`

**Interfaces:**
- Consumes: `SourceRecord`, `RawItem`.
- Produces: `load_source_registry(path) -> list[SourceRecord]`.
- Produces: `collect_source(source, fetch) -> CollectionResult(items, status, message)`; one failed source returns a failed result and never raises out of the batch runner.

- [ ] **Step 1: Add failing fixture-based parser tests**

```python
def test_rss_collector_preserves_source_and_publication_time():
    result = collect_source(source("fed_rss"), fixture_fetch("fed.xml"))
    assert result.status == "normal"
    assert result.items[0].source_id == "fed_rss"
    assert result.items[0].published_at.tzinfo is not None

def test_html_without_body_is_title_only_and_incomplete():
    result = collect_source(source("csrc_policy"), fixture_fetch("title-only.html"))
    assert result.items[0].body is None
    assert result.items[0].content_status == "title_only"
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/data_pipeline/test_signal_collectors.py -q`
Expected: FAIL because collectors do not exist.

- [ ] **Step 3: Implement registry validation and collectors**

Registry entries include `id`, `name`, `tier`, `official`, `base_weight`, `collector`, `url`, `categories`, `region`, `enabled`, and `access_notes`. Reject unknown collectors, non-HTTPS URLs, weights outside `[0,1]`, and duplicate IDs. Initial enabled sources are the verified government policy library, NBS release calendar, Fed RSS/FOMC calendar, BLS ICS, and ECB RSS; sources needing page-specific verification start disabled.

- [ ] **Step 4: Verify parser isolation and batch failure behavior**

Run: `python -m pytest tests/data_pipeline/test_signal_collectors.py -q`
Expected: PASS, including a timeout fixture where remaining sources still succeed.

- [ ] **Step 5: Commit**

```bash
git add config/signal_sources.json data_pipeline/source_registry.py data_pipeline/signal_collectors tests/data_pipeline
git commit -m "feat: add safe public signal collectors"
```

### Task 3: Deduplication, Event Clustering, and Rule Extraction

**Files:**
- Create: `data_pipeline/signal_cluster.py`
- Create: `config/signal_rules.json`
- Create: `data_pipeline/signal_rules.py`
- Create: `tests/data_pipeline/test_signal_cluster.py`
- Create: `tests/data_pipeline/test_signal_rules.py`

**Interfaces:**
- Consumes: `RawItem` records.
- Produces: `normalize_url(url)`, `content_fingerprint(item)`, `cluster_items(items, existing_clusters) -> list[EventCluster]`.
- Produces: `classify_cluster(cluster, rules) -> SignalDraft(category, direction, horizon, assets, fund_keywords, themes, fact, transmission)`.

- [ ] **Step 1: Write failing duplicate and classification tests**

```python
def test_syndicated_articles_count_as_one_independent_source():
    clusters = cluster_items([agency_original(), portal_reprint(), unrelated_article()], [])
    policy = next(c for c in clusters if c.topic_key == "fund_fee_reform")
    assert policy.item_count == 2
    assert policy.independent_source_count == 1

def test_overseas_item_requires_china_fund_transmission():
    assert classify_cluster(fed_rate_cluster(), RULES).themes == ["global-liquidity"]
    assert classify_cluster(unrelated_us_local_cluster(), RULES) is None
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/data_pipeline/test_signal_cluster.py tests/data_pipeline/test_signal_rules.py -q`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement deterministic clustering and configuration-driven rules**

Normalize tracking parameters and fragments, fingerprint normalized title/body, use token Jaccard similarity plus shared date/entities, and maintain publisher-group aliases so same-group reposts are not independent. Rules must distinguish `customer_real`, `customer_proxy`, and `media_attention`.

- [ ] **Step 4: Run clustering/rule tests**

Run: `python -m pytest tests/data_pipeline/test_signal_cluster.py tests/data_pipeline/test_signal_rules.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data_pipeline/signal_cluster.py data_pipeline/signal_rules.py config/signal_rules.json tests/data_pipeline
git commit -m "feat: cluster and classify signal events"
```

### Task 4: Transparent Scoring and Anomaly Detection

**Files:**
- Create: `config/signal_scoring.json`
- Create: `data_pipeline/signal_scoring.py`
- Create: `data_pipeline/signal_anomaly.py`
- Create: `tests/data_pipeline/test_signal_scoring.py`
- Create: `tests/data_pipeline/test_signal_anomaly.py`

**Interfaces:**
- Consumes: source, cluster, draft, prior 30-day topic counts, and `as_of`.
- Produces: `score_signal(...) -> ScoreBreakdown` with six component scores and `priority`.
- Produces: `detect_anomaly(current_count, independent_count, history, config) -> AnomalyResult`.

- [ ] **Step 1: Write failing evidence-tier and anomaly-ceiling tests**

```python
def test_real_customer_demand_outranks_media_heat_at_equal_evidence():
    real = score_signal(demand_kind="customer_real", **same_context)
    media = score_signal(demand_kind="media_attention", **same_context)
    assert real.customer_demand_score == 1.0
    assert real.priority > media.priority

def test_nonofficial_spike_never_becomes_official_fact():
    result = detect_anomaly(40, 12, [2] * 30, default_config())
    assert result.triggered is True
    assert result.validation_status == "pending_official_validation"
    assert result.effective_weight <= .60
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/data_pipeline/test_signal_scoring.py tests/data_pipeline/test_signal_anomaly.py -q`
Expected: FAIL with missing scoring/anomaly modules.

- [ ] **Step 3: Implement score components, decay, 30-day median/MAD baseline, minimum independent-source threshold, and configurable ceiling**

Do not multiply by zero for absent customer evidence; use a neutral configured floor for policy/macro signals, while explicitly storing `customer_demand_score=None`. Priority must be reproducible from stored components and config version.

- [ ] **Step 4: Run scoring and anomaly tests**

Run: `python -m pytest tests/data_pipeline/test_signal_scoring.py tests/data_pipeline/test_signal_anomaly.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/signal_scoring.json data_pipeline/signal_scoring.py data_pipeline/signal_anomaly.py tests/data_pipeline
git commit -m "feat: score signals and detect attention anomalies"
```

### Task 5: Catalysts and Beijing-Time Daily Brief

**Files:**
- Create: `data_pipeline/catalysts.py`
- Create: `data_pipeline/daily_brief.py`
- Create: `tests/data_pipeline/test_catalysts.py`
- Create: `tests/data_pipeline/test_daily_brief.py`

**Interfaces:**
- Produces: `normalize_catalysts(raw_items, as_of) -> list[CatalystRecord]` and `attach_outcome(catalyst, raw_item)`.
- Produces: `brief_window(run_at, ZoneInfo("Asia/Shanghai")) -> (start, end)` and `build_daily_brief(repo, run_at) -> DailyBrief`.

- [ ] **Step 1: Write failing timezone, boundary, empty-day, and catalyst tests**

```python
def test_daily_window_is_previous_0800_to_current_0800_shanghai():
    start, end = brief_window(datetime(2026, 8, 14, 8, 0, tzinfo=SHANGHAI))
    assert start.isoformat() == "2026-08-13T08:00:00+08:00"
    assert end.isoformat() == "2026-08-14T08:00:00+08:00"

def test_signal_at_exact_end_is_excluded():
    brief = build_daily_brief(repo_with_signals("07:59:59", "08:00:00"), RUN_AT)
    assert brief.signal_ids == ["before-boundary"]

def test_no_material_news_is_an_explicit_brief():
    assert build_daily_brief(empty_repo(), RUN_AT).top_call == "过去24小时无重大新增信号"
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/data_pipeline/test_catalysts.py tests/data_pipeline/test_daily_brief.py -q`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement calendar normalization, seven-day preview, outcome archive, and deterministic two-minute brief payload**

Top Call selects the highest valid priority, never a stale or unverified media-only signal. Brief sections contain IDs and concise generated text so the UI can link back to evidence.

- [ ] **Step 4: Run brief/catalyst tests**

Run: `python -m pytest tests/data_pipeline/test_catalysts.py tests/data_pipeline/test_daily_brief.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data_pipeline/catalysts.py data_pipeline/daily_brief.py tests/data_pipeline
git commit -m "feat: generate catalyst-aware daily signal brief"
```

### Task 6: Supabase Schema, Adapter, Publisher, and CLI

**Files:**
- Create: `supabase/migrations/202608140001_signal_intelligence.sql`
- Create: `data_pipeline/supabase_storage.py`
- Create: `data_pipeline/signal_publish.py`
- Create: `data_pipeline/signal_cli.py`
- Create: `tests/data_pipeline/test_signal_publish.py`
- Create: `tests/data_pipeline/test_signal_cli.py`
- Create: `docs/signal-intelligence-setup.md`

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` for server-side writes; no browser-visible service key.
- Produces: CLI commands `collect --as-of`, `brief --run-at`, `publish --output`, and `health`.
- Produces: snapshot schema `{schemaVersion, generatedAt, health, regime, signals, themes, catalysts, dailyBrief}`.

- [ ] **Step 1: Write failing atomic publication and missing-secret tests**

```python
def test_publish_replaces_snapshot_atomically(tmp_path):
    target = tmp_path / "signal-radar.json"
    publish_snapshot(repo_with_signal(), target)
    payload = json.loads(target.read_text(encoding="utf-8"))
    assert payload["schemaVersion"] == 1
    assert not list(tmp_path.glob("*.tmp"))

def test_collect_without_supabase_uses_local_sqlite(tmp_path, monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    assert main(["collect", "--db", str(tmp_path / "signals.db"), "--fixtures"]) == 0
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/data_pipeline/test_signal_publish.py tests/data_pipeline/test_signal_cli.py -q`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement migration, RLS, PostgreSQL adapter, atomic publisher, CLI, and setup guide**

RLS permits anonymous `SELECT` only from published views/tables and denies anonymous writes. The guide documents creating a Supabase project, applying the migration, setting GitHub secrets, rotating credentials, and running fixture mode without credentials.

- [ ] **Step 4: Run all Python tests and a fixture end-to-end command**

Run: `python -m pytest tests/data_pipeline -q`
Run: `python -m data_pipeline.signal_cli collect --db .tmp/signals.db --fixtures && python -m data_pipeline.signal_cli brief --db .tmp/signals.db --run-at 2026-08-14T08:00:00+08:00 && python -m data_pipeline.signal_cli publish --db .tmp/signals.db --output .tmp/signal-radar.json`
Expected: tests PASS and valid snapshot written.

- [ ] **Step 5: Commit**

```bash
git add supabase data_pipeline tests/data_pipeline docs/signal-intelligence-setup.md
git commit -m "feat: publish signal intelligence from Supabase"
```

### Task 7: GitHub Actions Hourly and Daily Automation

**Files:**
- Create: `.github/workflows/signal-intelligence.yml`
- Create: `scripts/run_signal_schedule.py`
- Create: `tests/data_pipeline/test_signal_schedule.py`

**Interfaces:**
- Produces: `select_jobs(now_utc) -> list[str]`; hourly runs always collect/publish, and the first run at or after 00:00 UTC (08:00 Shanghai) generates one idempotent brief for that Beijing date.

- [ ] **Step 1: Write failing schedule tests**

```python
def test_midnight_utc_runs_collect_brief_and_publish():
    assert select_jobs(datetime(2026, 8, 14, 0, 0, tzinfo=UTC)) == ["collect", "brief", "publish"]

def test_other_hours_run_collect_and_publish_only():
    assert select_jobs(datetime(2026, 8, 14, 1, 0, tzinfo=UTC)) == ["collect", "publish"]
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/data_pipeline/test_signal_schedule.py -q`
Expected: FAIL because schedule module does not exist.

- [ ] **Step 3: Implement idempotent scheduler and workflow**

Workflow uses `cron: '7 * * * *'` to avoid top-of-hour congestion, `workflow_dispatch`, concurrency cancellation, Python dependency caching, a 10-minute job timeout, least-privilege permissions, and masked secrets. It writes to Supabase and publishes the snapshot through an authenticated deployment path; it must not commit hourly data to git.

- [ ] **Step 4: Validate workflow and schedule**

Run: `python -m pytest tests/data_pipeline/test_signal_schedule.py -q`
Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/signal-intelligence.yml', encoding='utf-8'))"`
Expected: PASS and valid YAML.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/signal-intelligence.yml scripts/run_signal_schedule.py tests/data_pipeline/test_signal_schedule.py
git commit -m "ci: automate hourly signal intelligence updates"
```

### Task 8: Frontend Live Signal Contract and Expanded Radar

**Files:**
- Create: `public/data/signal-radar.json`
- Create: `src/features/signal-radar/signalApi.js`
- Create: `src/features/signal-radar/signalApi.test.js`
- Create: `src/features/signal-radar/SignalHealth.jsx`
- Create: `src/features/signal-radar/SignalBadges.jsx`
- Create: `src/features/signal-radar/DailyBrief.jsx`
- Create: `src/features/signal-radar/CatalystList.jsx`
- Modify: `src/features/signal-radar/SignalRadar.jsx`
- Modify: `src/features/signal-radar/SignalFeed.jsx`
- Modify: `src/features/signal-radar/SignalDrawer.jsx`
- Modify: `src/features/signal-radar/SignalFilters.jsx`
- Modify: `src/features/signal-radar/signalModel.js`
- Modify: `src/features/signal-radar/signalRadar.css`
- Create: `tests/signal-radar-live.spec.js`

**Interfaces:**
- Consumes snapshot schema from Task 6 through `fetchSignalSnapshot(fetchImpl, url)`.
- Produces explicit states `loading`, `ready`, `stale`, and `error`; stale keeps the last valid snapshot and timestamp.
- Produces pagination in batches of 30 and filters for `customer_real` versus `customer_proxy`.

- [ ] **Step 1: Write failing contract and browser tests**

```javascript
test('rejects a signal snapshot without source traceability', async () => {
  await assert.rejects(() => fetchSignalSnapshot(fakeFetch({ signals: [{ id: 'x' }] })))
})
```

```javascript
test('shows live health, richer signals, brief, catalysts and score evidence', async ({ page }) => {
  await page.route('**/data/signal-radar.json', route => route.fulfill({ json: snapshotFixture }))
  await page.goto('/')
  await expect(page.getByText('最后更新')).toBeVisible()
  await expect(page.locator('[data-signal-id]')).toHaveCount(30)
  await page.getByRole('button', { name: '加载更多' }).click()
  await expect(page.locator('[data-signal-id]')).toHaveCount(35)
  await page.getByRole('button', { name: '今日决策信号日报' }).click()
  await expect(page.getByRole('heading', { name: '今日 Top Call' })).toBeVisible()
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test src/features/signal-radar/*.test.js`
Run: `npx playwright test tests/signal-radar-live.spec.js --reporter=line`
Expected: FAIL because API and UI do not exist.

- [ ] **Step 3: Implement fetch validation, stale fallback, health, badges, score explanation, customer evidence split, pagination, brief, and catalysts**

Keep the existing drawer focus return and watchlist persistence. Source links open in a new tab with `rel="noreferrer"`. Low-confidence or pending signals display an explicit warning and cannot be styled as official.

- [ ] **Step 4: Run frontend unit, existing radar, theme, and fund tests**

Run: `node --test src/features/signal-radar/*.test.js src/data/*.test.js`
Run: `npm run build`
Run: `npx playwright test tests/signal-radar.spec.js tests/signal-radar-live.spec.js tests/theme-workspace.spec.js tests/fund-products.spec.js tests/workspace-navigation.spec.js --reporter=line`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/data/signal-radar.json src/features/signal-radar tests/signal-radar-live.spec.js
git commit -m "feat: expand signal radar with live intelligence"
```

### Task 9: Full Verification, Security Review, and Preview

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Verifies the complete story from fixture collection to browser rendering without requiring production credentials.

- [ ] **Step 1: Run the full Python suite**

Run: `python -m pytest tests/data_pipeline -q`
Expected: all tests PASS.

- [ ] **Step 2: Run the full JavaScript unit suite and production build**

Run: `node --test src/data/*.test.js src/features/signal-radar/*.test.js`
Run: `npm run build`
Expected: all tests PASS and Vite build exits 0.

- [ ] **Step 3: Run all browser tests**

Run: `npx playwright test --reporter=line`
Expected: all tests PASS at desktop and configured mobile viewport.

- [ ] **Step 4: Perform secret and permissions checks**

Run: `git grep -n -E 'SUPABASE_(DB_URL|SERVICE_ROLE_KEY)=' -- ':!docs/**' ':!.env.example'`
Expected: no matches.

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only intentional files are modified.

- [ ] **Step 5: Start preview and verify health manually**

Run: `npm run preview -- --host 127.0.0.1 --port 4176`
Verify: three primary navigation tabs, 30-item initial signal page, drawer source traceability, daily brief, catalysts, theme-to-fund jump, representative shares, and stale-state timestamp.

- [ ] **Step 6: Commit final verification fixes if any**

```bash
git status --short
# Stage only the concrete verification-fix paths printed above; if there are no fixes, skip this commit.
git commit -m "test: verify automated signal intelligence"
```

---

## Deployment Inputs Required From the User

Implementation and fixture-mode verification can finish without external credentials. Enabling production automation requires the user to create a Supabase project and provide repository secrets through GitHub settings, never in chat or committed files:

- `SUPABASE_DB_URL` for the server-side workflow.
- A read-only browser configuration (project URL and anon key) only if the frontend moves from published JSON to direct Supabase reads.
- Confirmation whether the GitHub repository is public or private so hourly runner usage can be budgeted.

Production activation is a separate, explicit external-state step after local verification.
