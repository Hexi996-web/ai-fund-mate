# AI虚拟产品经理 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有基金 SPA 升级为只展示真实已有字段、支持存续过滤、分类、组合搜索、真实字段排序和响应式双视图的“AI虚拟产品经理”。

**Architecture:** 将数据标准化和派生列表逻辑从页面拆到纯函数模块，用可注入 Storage 的缓存模块隔离浏览器副作用；React 页面仅持有交互状态并组合专用展示组件。每日生成的同域 `funds_active.json` 是主源，简化 API 是只读降级源。

**Tech Stack:** React 18、Vite、原生 CSS Modules/组件 CSS、Node 内置测试运行器、Python/AKShare 离线数据任务。

## Global Constraints

- 页面标题必须精确为“AI虚拟产品经理”。
- 不生成或展示模拟的基金规模、基金经理、成立日期及日涨跌幅。
- 页面数量称为“基金份额”，官方基金主体数量仅作为带日期的参考口径。
- 搜索防抖固定为 300ms。
- 主数据缓存键为 `ai-fund-mate:funds:v3`，`schemaVersion` 固定为 `3`。
- 桌面默认列表、移动端默认卡片，用户选择必须持久化。
- 排序只使用真实字段，空值永远放在末尾。

---

## File Map

- Create `src/data/fundModel.js`: 标准化、存续判断、分类、过滤和排序纯函数。
- Create `src/data/fundModel.test.js`: 数据领域规则单元测试。
- Create `src/data/fundCache.js`: v3 缓存读写、损坏缓存清理和偏好持久化。
- Create `src/data/fundCache.test.js`: 使用内存 Storage 测试缓存。
- Modify `src/data/fundData.js`: 返回数据源标识并保留主源/降级源策略。
- Modify `src/data/fundData.test.js`: 覆盖主源、空主源、网络降级与中止。
- Create `src/components/FundViews.jsx`: 卡片、表格、状态标签和骨架视图。
- Create `src/components/FundControls.jsx`: 搜索、分类、排序和视图切换。
- Modify `src/App.jsx`: 页面状态、加载流程、派生列表和 AI 文案。
- Modify `src/App.css`: 新组件、响应式布局和无横向溢出规则。
- Modify `src/index.css`: 全局字体、颜色和页面基础规则。
- Modify `index.html`: 浏览器标题。

### Task 1: Fund domain model

**Files:**
- Create: `src/data/fundModel.js`
- Test: `src/data/fundModel.test.js`

**Interfaces:**
- Produces: `normalizeFunds(payload) -> Fund[]`, `classifyFund(fund) -> Category`, `selectFunds(funds, options) -> Fund[]`。
- `Fund` 字段为 `code,name,type,netValue,dailyChangePercent,lastNetValueDate,purchaseStatus,redemptionStatus,operationStatus`，缺失值为 `null`。

- [ ] **Step 1: Write failing normalization and inactive-filter tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFunds } from './fundModel.js'

test('normalizes real fields and excludes terminated records', () => {
  const funds = normalizeFunds({ funds: [
    { code: '1', name: '示例混合', type: '混合型', netValue: '1.25', dailyChangePercent: '0.4%', lastNetValueDate: '2026-08-08', purchaseStatus: '开放申购', redemptionStatus: '开放赎回', operationStatus: 'active' },
    { code: '2', name: '已清盘基金', operationStatus: 'terminated' },
  ] })
  assert.deepEqual(funds, [{ code: '000001', name: '示例混合', type: '混合型', netValue: 1.25, dailyChangePercent: 0.4, lastNetValueDate: '2026-08-08', purchaseStatus: '开放申购', redemptionStatus: '开放赎回', operationStatus: 'active' }])
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test src/data/fundModel.test.js`
Expected: FAIL because `fundModel.js` does not exist.

- [ ] **Step 3: Implement normalization and explicit inactive filtering**

Implement `firstPresent`, nullable numeric/date normalization, code padding, duplicate-code removal and exclusion when the status or name contains `terminated|suspected_terminated|终止|清算|已清盘|终止上市`. Do not synthesize missing values.

- [ ] **Step 4: Add failing category and combined-selection tests**

```js
test('classifies FOF before broader mixed keywords', () => {
  assert.equal(classifyFund({ name: '养老混合基金中基金 FOF', type: '混合型' }), 'FOF')
})

test('combines search category and descending return sort with null last', () => {
  const result = selectFunds(sampleFunds, { query: '消费', category: '股票型', sortMode: 'change-desc' })
  assert.deepEqual(result.map((fund) => fund.code), ['000002', '000001', '000003'])
})
```

- [ ] **Step 5: Implement classification and immutable sorting**

Use category priority `FOF → 货币市场 → 股票型 → 混合型 → 债券型 → 其他`. Implement sort modes `default`, `change-desc`, `change-asc`, `nav-desc`, `nav-asc`, `date-desc`, `date-asc`, `code-asc`, `code-desc`; the comparator must place `null` after real values in both directions.

- [ ] **Step 6: Run domain tests**

Run: `node --test src/data/fundModel.test.js`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/fundModel.js src/data/fundModel.test.js
git commit -m "feat: add fund filtering and classification model"
```

### Task 2: Versioned cache and source fallback

**Files:**
- Create: `src/data/fundCache.js`
- Test: `src/data/fundCache.test.js`
- Modify: `src/data/fundData.js`
- Modify: `src/data/fundData.test.js`

**Interfaces:**
- Consumes: normalized `Fund[]` from Task 1.
- Produces: `readFundCache(storage,today)`, `writeFundCache(storage,value)`, `readPreference(storage,key,fallback)`, `writePreference(storage,key,value)`.

- [ ] **Step 1: Write failing cache tests**

Cover correct same-day v3 reuse, rejection of v2/yesterday, malformed JSON removal, quota-write failure without throwing, and independent preference persistence. Use a small `MemoryStorage` class implementing `getItem`, `setItem`, and `removeItem`.

- [ ] **Step 2: Run cache tests and verify failure**

Run: `node --test src/data/fundCache.test.js`
Expected: FAIL because exports do not exist.

- [ ] **Step 3: Implement the cache module**

Use constants `FUND_CACHE_KEY = 'ai-fund-mate:funds:v3'` and `SCHEMA_VERSION = 3`. Validate `date`, `source`, and `funds` before returning. On parse failure call `removeItem(FUND_CACHE_KEY)` and return `null`; catch write failures and return `false`.

- [ ] **Step 4: Extend source tests**

Assert `{payload, source:'active'}` for a valid local snapshot, `{payload, source:'fallback'}` after invalid or failed local data, and rethrow `AbortError` without attempting fallback.

- [ ] **Step 5: Keep fetch implementation minimal**

Retain `/funds_active.json` as `ACTIVE_FUNDS_URL` and the GitHub Pages JSON as `SOURCE_FUNDS_URL`. `requestJson` must check `response.ok`; `fetchFundPayload` must never swallow `AbortError`.

- [ ] **Step 6: Run all data tests**

Run: `node --test src/data/*.test.js`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/fundCache.js src/data/fundCache.test.js src/data/fundData.js src/data/fundData.test.js
git commit -m "feat: add versioned fund cache"
```

### Task 3: React controls and complete real-field views

**Files:**
- Create: `src/components/FundControls.jsx`
- Create: `src/components/FundViews.jsx`
- Modify: `src/App.jsx`
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 1 selectors and Task 2 cache/source functions.
- `FundControls` receives controlled `query`, `category`, `sortMode`, `viewMode` and their change callbacks.
- `FundCard` and `FundTable` receive already selected `funds` and render no simulated values.

- [ ] **Step 1: Replace page loading flow**

On mount, read same-day v3 cache; otherwise call `fetchFundPayload`, normalize with `normalizeFunds`, persist `{schemaVersion:3,date,fetchedAt,source,funds}`, and retain stale valid cache only as a network-failure fallback. Abort the request on unmount.

- [ ] **Step 2: Implement 300ms query debounce and derived selection**

Use `setTimeout` inside an effect and return `() => clearTimeout(timer)`. Pass `debouncedQuery`, `selectedCategory`, and `sortMode` into `selectFunds` inside `useMemo`.

- [ ] **Step 3: Add controlled classification and sorting controls**

Render exactly `全部、股票型、混合型、债券型、货币市场、FOF、其他`. Render real sort options only: default, daily change, NAV, net-value date and code in both directions.

- [ ] **Step 4: Render all available real fields in both views**

Card and table cells show name, code, type, unit NAV, daily change, last NAV date, purchase status, redemption status and operation status. Render `--` for null. Use red only for values `> 0`, green only for values `< 0`, and neutral for zero/null.

- [ ] **Step 5: Implement view preference and AI copy**

If no stored preference exists, use `matchMedia('(max-width: 767px)')` to choose card on mobile and list otherwise. Persist manual changes. AI copy priority is loading/error, empty, combined search/category, search, category, ready. Title and `index.html` title must be “AI虚拟产品经理”.

- [ ] **Step 6: Add source and count disclosure**

Label loaded records as “基金份额”。Display “官方参考：截至 2026 年 5 月底境内公募基金 14,173 只（不含已报送清盘基金）” with a link to the AMAC PDF. If `source === 'fallback'`, explain that only code、名称和类型 may be available.

- [ ] **Step 7: Run build**

Run: `npm run build`
Expected: Vite exits 0 with assets emitted to `dist/`.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/components/FundControls.jsx src/components/FundViews.jsx index.html
git commit -m "feat: add fund filters sorting and detail views"
```

### Task 4: Responsive styling and accessibility

**Files:**
- Modify: `src/App.css`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: class names emitted by Task 3 components.
- Produces: stable desktop table and mobile card presentation with no horizontal page overflow.

- [ ] **Step 1: Style filters and toolbar**

Use wrapping category chips with a visible selected state, minimum 44px touch targets, focus-visible outlines, and a toolbar that wraps below 768px.

- [ ] **Step 2: Style complete card and table fields**

Use a responsive card definition grid and semantic table with a scroll container limited to the table region. Status badges may wrap; names use `overflow-wrap:anywhere`. Do not hide fields on mobile.

- [ ] **Step 3: Preserve loading, empty and error states**

Extend skeletons to represent detail rows and ensure `aria-busy`, error contrast and disabled controls remain visually clear.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: PASS without CSS parse warnings.

- [ ] **Step 5: Commit**

```bash
git add src/App.css src/index.css
git commit -m "style: add responsive fund views"
```

### Task 5: Full verification and release handoff

**Files:**
- Verify: `src/data/*.test.js`, `scripts/test_update_active_funds.py`, `src/App.jsx`, `src/App.css` and the production bundle.

**Interfaces:**
- Consumes: completed V2 application.
- Produces: test/build evidence and a deployable `main` branch.

- [ ] **Step 1: Run automated tests**

Run: `node --test src/data/*.test.js`
Expected: all tests PASS.

Run: `python -m unittest scripts/test_update_active_funds.py`
Expected: all tests PASS.

- [ ] **Step 2: Run final build**

Run: `npm run build`
Expected: Vite exits 0 and creates `dist/`.

- [ ] **Step 3: Run static checks**

Run: `git diff --check`
Expected: no whitespace errors.

- [ ] **Step 4: Verify interaction matrix**

At desktop and 375px widths verify initial view, card/list persistence, category counts, `消费 + 股票型` combined filtering, all sort directions, empty results, real-field null rendering, source warning, no page overflow, and no console errors.

- [ ] **Step 5: Commit verification fixes when Step 1–4 changed tracked files**

```bash
git add src/App.jsx src/App.css src/index.css src/components src/data
git commit -m "fix: resolve v2 verification findings"
```

- [ ] **Step 6: Push and deploy**

Run: `git push origin main`, then let the linked Vercel project deploy from GitHub. If the local branch cannot reach GitHub, report the exact network error and provide the exact manual push command instead of claiming deployment succeeded.

- [ ] **Step 7: Verify production**

Open `https://ai-fund-mate.vercel.app/` and repeat loading, one category, one combined search, one sort and console-error checks. Record the production URL and deployed commit.
