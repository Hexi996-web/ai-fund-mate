# Complete Workspace Signal Radar Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the verified signal radar into the complete AI Fund Mate workspace while preserving five-theme research and representative-share fund product aggregation.

**Architecture:** Keep `WorkspaceApp` as the only top-level orchestrator and extend its workspace state from two views to `signals | themes | funds`. Port the signal radar as an isolated feature directory; do not change the public contracts of `ThemeWorkspace`, `ThemeFunds`, `fundProductModel`, or the fund product data pipeline.

**Tech Stack:** React 18, Vite, plain CSS, Node built-in test runner, Playwright.

## Global Constraints

- Base implementation is `codex/fund-product-share-model`, not the later ordinary-share fund library.
- Primary navigation order is exactly `信号雷达 | 主题研判 | 基金产品库`.
- Default workspace is `signals`.
- Do not add router, charting, global-state, or component-library dependencies.
- Preserve the five-theme JSON contracts under `/data/five-themes/`.
- Preserve product/share aggregation, representative-share selection, product/share counts, and share expansion.
- Theme-to-fund navigation must continue to pass a query and context label.
- Official, public, proxy, and demo signal evidence must remain visibly distinct.
- Customer signals may only be proxy or demo; they may not claim real customer research.
- A failure in one workspace must not remove navigation or prevent switching to the other workspaces.
- The application remains internal research assistance, not personalized investment advice, compliance approval, or transaction execution.

---

## File Map

- Create `src/features/signal-radar/*`: verified signal data, pure model, watchlist persistence, workbench components, drawer, and CSS.
- Modify `src/WorkspaceApp.jsx`: three-workspace navigation and signal radar composition.
- Modify `src/workspace.css`: three-item navigation sizing and signal workspace container alignment.
- Modify `playwright.config.js`: Windows-compatible preview command while preserving non-Windows behavior.
- Create `tests/complete-workspace.spec.js`: navigation, radar, theme-to-product, and representative-share end-to-end contract.
- Create `tests/complete-responsive.spec.js`: 1440/768/390 overflow and drawer checks.
- Preserve existing theme/product unit and browser tests, adapting only entry-state expectations where the new default requires explicit navigation.

### Task 1: Lock the complete-version baseline

**Files:**
- Test: existing `src/data/*.test.js`
- Test: existing `tests/theme-workspace.spec.js`
- Test: existing `tests/fund-products.spec.js`
- Test: existing `tests/workspace-navigation.spec.js`

**Interfaces:**
- Confirms `ThemeWorkspace({ onOpenFundLibrary })` and `App({ initialQuery, onQueryChange })` contracts before integration.
- Confirms `normalizeProducts(payload)` and `selectProducts(products, options)` remain unchanged.

- [ ] **Step 1: Run the complete unit baseline**

Run:

```powershell
node --test src/data/*.test.js
```

Expected: all existing theme, evidence localization, product model, fund cache, and fund data tests pass.

- [ ] **Step 2: Run the complete browser baseline**

Run:

```powershell
npm.cmd run build
npx.cmd playwright test tests/theme-workspace.spec.js tests/fund-products.spec.js tests/workspace-navigation.spec.js
```

Expected: theme workspace, representative-share product library, and two-workspace navigation tests pass before modification.

### Task 2: Port the pure signal model and watchlist

**Files:**
- Create: `src/features/signal-radar/signalData.js`
- Create: `src/features/signal-radar/signalModel.js`
- Create: `src/features/signal-radar/signalModel.test.js`
- Create: `src/features/signal-radar/watchlist.js`
- Create: `src/features/signal-radar/watchlist.test.js`

**Interfaces:**
- Produces `SIGNALS`, `MARKET_REGIME`, `OPPORTUNITY_THEMES`.
- Produces `filterSignals`, `sortSignals`, `isSignalStale`, `getSignalSummary`, `getThemeEvidence`.
- Produces `readWatchlist`, `writeWatchlist`, `toggleWatchlist`, `WATCHLIST_KEY`.

- [ ] **Step 1: Copy the verified tests first**

Bring the model and watchlist tests from commit `7416d8b` into this branch without production files.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test src/features/signal-radar/signalModel.test.js src/features/signal-radar/watchlist.test.js
```

Expected: FAIL with missing `signalModel.js` and `watchlist.js`.

- [ ] **Step 3: Port the verified pure implementations and data**

Bring `signalData.js`, `signalModel.js`, and `watchlist.js` from commit `7416d8b`. Keep the same source labels, explicit dates, counter-evidence, invalidation conditions, and customer proxy/demo constraints.

- [ ] **Step 4: Verify GREEN and the complete baseline**

Run:

```powershell
node --test src/data/*.test.js src/features/signal-radar/*.test.js
```

Expected: all old and new unit tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/features/signal-radar/signalData.js src/features/signal-radar/signalModel.js src/features/signal-radar/signalModel.test.js src/features/signal-radar/watchlist.js src/features/signal-radar/watchlist.test.js
git commit -m "feat: port signal radar research model"
```

### Task 3: Port the signal radar UI

**Files:**
- Create: `src/features/signal-radar/SignalRadar.jsx`
- Create: `src/features/signal-radar/SignalSummary.jsx`
- Create: `src/features/signal-radar/SignalFilters.jsx`
- Create: `src/features/signal-radar/SignalFeed.jsx`
- Create: `src/features/signal-radar/OpportunityThemes.jsx`
- Create: `src/features/signal-radar/SignalDrawer.jsx`
- Create: `src/features/signal-radar/signalRadar.css`
- Test: `tests/complete-workspace.spec.js`

**Interfaces:**
- `SignalRadar()` has no required props and owns filter, selected signal, and watchlist state.
- `SignalDrawer({ signal, isWatched, onToggleWatch, onClose, returnFocusRef })` preserves focus containment and focus return.

- [ ] **Step 1: Write failing radar browser tests**

Create `tests/complete-workspace.spec.js` with:

```js
import { expect, test } from '@playwright/test'

test('defaults to the signal radar and keeps evidence labels explicit', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '信号雷达' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: '今日决策摘要' })).toBeVisible()
  await page.getByRole('button', { name: '客户代理' }).click()
  await expect(page.locator('[data-signal-category="customer"]')).toHaveCount(2)
  await expect(page.getByText('需求代理', { exact: true }).first()).toBeVisible()
})

test('opens the signal evidence drawer and persists the watchlist', async ({ page }) => {
  await page.goto('/')
  const trigger = page.locator('[data-signal-id]').first()
  await trigger.click()
  const drawer = page.getByRole('dialog', { name: '信号详情' })
  await drawer.getByRole('button', { name: '加入机会观察池' }).click()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.reload()
  await page.locator('[data-signal-id]').first().click()
  await expect(page.getByRole('button', { name: '移出机会观察池' })).toBeVisible()
})
```

- [ ] **Step 2: Verify RED**

Run: `npx.cmd playwright test tests/complete-workspace.spec.js --grep "signal"`

Expected: FAIL because signal navigation and UI do not exist.

- [ ] **Step 3: Port the verified React components and CSS**

Bring the seven component/style files from commit `7416d8b` without importing its `AppNavigation` or ordinary fund-library integration.

- [ ] **Step 4: Build the isolated UI**

Run: `npm.cmd run build`

Expected: succeeds after the UI files exist, even before `WorkspaceApp` mounts them.

### Task 4: Integrate three-workspace navigation

**Files:**
- Modify: `src/WorkspaceApp.jsx`
- Modify: `src/workspace.css`
- Modify: `playwright.config.js`
- Modify: existing browser tests only where default workspace expectations change.
- Test: `tests/complete-workspace.spec.js`

**Interfaces:**
- `workspace` values: `signals | themes | funds`.
- Existing `openFundLibrary({ query, contextLabel })` remains the only theme-to-fund transition.
- Active navigation button has `aria-current="page"`.

- [ ] **Step 1: Extend the failing integration test**

Add:

```js
test('switches among all workspaces and carries a theme query to representative products', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '主题研判' }).click()
  await expect(page.getByRole('heading', { name: '主题研判总览' })).toBeVisible()
  await page.getByRole('button', { name: /AI与半导体/ }).click()
  await page.getByRole('button', { name: /查看相关基金/ }).click()
  await expect(page.getByRole('button', { name: '基金产品库' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.search-box input')).not.toHaveValue('')
  await expect(page.locator('[data-product-id]').first()).toBeVisible()
})
```

- [ ] **Step 2: Verify RED**

Run: `npx.cmd playwright test tests/complete-workspace.spec.js`

Expected: FAIL because the three-workspace orchestration is not implemented.

- [ ] **Step 3: Implement the three-workspace orchestrator**

Set default workspace to `signals`; render navigation in exact order; mount `<SignalRadar />`, `<ThemeWorkspace onOpenFundLibrary={openFundLibrary} />`, or `<FundApp initialQuery={fundContext.query} onQueryChange={rememberFundQuery} />`. Add `aria-current="page"` and preserve existing active class for CSS compatibility.

- [ ] **Step 4: Update cross-platform Playwright startup**

Use:

```js
command: process.platform === 'win32'
  ? 'npm.cmd run preview -- --host 127.0.0.1 --port 4175'
  : 'npm run preview -- --host 127.0.0.1 --port 4175'
```

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm.cmd run build
npx.cmd playwright test tests/complete-workspace.spec.js
```

Expected: all integration tests pass.

- [ ] **Step 6: Commit UI and orchestration**

```powershell
git add -- src/features/signal-radar src/WorkspaceApp.jsx src/workspace.css playwright.config.js tests/complete-workspace.spec.js
git commit -m "feat: integrate complete three-workspace navigation"
```

### Task 5: Protect representative-share and theme regressions

**Files:**
- Modify: `tests/fund-products.spec.js` only if it assumes funds are the default workspace.
- Modify: `tests/theme-workspace.spec.js` only if it assumes themes are the default workspace.
- Modify: `tests/workspace-navigation.spec.js` to assert all three navigation items.
- Preserve: production theme and product files.

**Interfaces:**
- Product tests must assert separate product/share totals, representative code, and share expansion.
- Theme tests must assert five-theme load, detail evidence, and theme-to-fund query.

- [ ] **Step 1: Run existing browser tests**

Run:

```powershell
npx.cmd playwright test tests/theme-workspace.spec.js tests/fund-products.spec.js tests/workspace-navigation.spec.js
```

Expected: failures may only be caused by the new default workspace/navigation count; any product grouping or theme data failure is a production regression and must be fixed before continuing.

- [ ] **Step 2: Adapt only default-entry steps**

At test setup, click `主题研判` before theme assertions and `基金产品库` before product assertions. Replace two-navigation counts with exact three-navigation labels. Do not weaken product/share or evidence assertions.

- [ ] **Step 3: Verify existing feature suites**

Run the same command and expect all tests to pass.

### Task 6: Responsive and full verification

**Files:**
- Create: `tests/complete-responsive.spec.js`
- Modify only files with proven responsive defects.

**Interfaces:**
- Tests all three workspaces at 1440, 768, and 390 pixels.

- [ ] **Step 1: Write responsive contract tests**

For each viewport, assert document/body width does not exceed viewport. At 390px open a signal drawer, a theme detail, and a product share expansion in separate tests and assert their bounding boxes remain within the viewport.

- [ ] **Step 2: Run responsive tests**

Run: `npx.cmd playwright test tests/complete-responsive.spec.js`

Expected: PASS, or fail with a concrete overflowing element that must be fixed in the owning CSS file.

- [ ] **Step 3: Run source-integrity audit**

Check every official signal has an official URL and explicit date; every customer signal is proxy/demo; each opportunity theme has counter-evidence or invalidation; no visible copy claims guaranteed returns or compliance approval.

- [ ] **Step 4: Run final verification**

```powershell
node --test src/data/*.test.js src/features/signal-radar/*.test.js
npm.cmd run build
npx.cmd playwright test
git diff --check
git status --short
```

Expected: all unit tests pass, build exits 0, all browser tests pass, and the worktree contains only intentional integration files.

- [ ] **Step 5: Commit verified test adaptations if needed**

```powershell
git add -- tests src/workspace.css
git commit -m "test: verify complete fund research workspace"
```

Do not create an empty commit when no files changed.
