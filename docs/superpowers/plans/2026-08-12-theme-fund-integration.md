# Theme and Fund Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复基金产品库，统一“主题研判”命名，并在五个主题中展示可追溯的相关基金与规则化简析。

**Architecture:** 保留 `WorkspaceApp` 作为两个工作区的轻量状态容器；将主题数据联表、排序、债券分层和简析放入独立纯函数模块，再由 `ThemeWorkspace` 渲染。基金库继续使用现有 `FundApp`，通过显式的初始查询参数接收主题或基金跳转，数据源之间并行加载、局部降级。

**Tech Stack:** React 18、Vite、Node test runner、Playwright、静态 JSON、Vercel Preview。

## Global Constraints

- 导航统一使用“主题研判”，标题统一使用“主题研判总览”。
- 红利与债券分别显示为“红利基金”“债券基金”。
- 每个主题默认最多展示五只基金；人工审核优先、置信度次之、数据完整度再次之。
- 规则化简析只引用公开字段和匹配规则，不生成买卖建议。
- 不修改评分、情景算法，不导入历史数据，不增加付费数据源。
- 任一基金数据源失败不得阻止主题评分与证据展示。

---

### Task 1: 工作区切换与基金库恢复

**Files:**
- Modify: `src/WorkspaceApp.jsx`
- Modify: `src/App.jsx`
- Modify: `src/data/fundData.js`
- Test: `tests/theme-workspace.spec.js`
- Test: `tests/mobile-layout.spec.js`

**Interfaces:**
- `WorkspaceApp` 保存 `{ workspace, fundContext }`。
- `FundApp({ initialQuery, contextLabel, onClearContext })` 接收主题跳转条件；无参数时保持原行为。
- 基金库继续使用 `fetchFundPayload(fetchImpl, options)`。

- [ ] **Step 1: 写工作区往返与基金库功能失败测试**

在 `tests/theme-workspace.spec.js` 添加：点击“基金产品库”后可见搜索框和基金结果；输入基金代码后结果收敛；点击“主题研判”再返回基金库时查询仍保留。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm.cmd run test:e2e -- tests/theme-workspace.spec.js`
Expected: FAIL，现有工作区没有测试要求的稳定状态保留或主题来源条件接口。

- [ ] **Step 3: 最小实现工作区状态和基金库参数**

在 `WorkspaceApp` 中保存基金上下文并向 `FundApp` 传入参数；在 `FundApp` 中使用懒初始化读取 `initialQuery`，仅当主题跳转显式发生时更新查询。保持现有缓存、筛选和降级数据逻辑不变。

- [ ] **Step 4: 增加移动端往返断言并跑 GREEN**

Run: `npm.cmd run test:e2e -- tests/theme-workspace.spec.js tests/mobile-layout.spec.js`
Expected: PASS，桌面与移动端均可打开基金库、搜索并往返。

- [ ] **Step 5: 提交**

```powershell
git add src/WorkspaceApp.jsx src/App.jsx src/data/fundData.js tests/theme-workspace.spec.js tests/mobile-layout.spec.js
git commit -m "fix: restore fund library workspace"
```

### Task 2: 统一主题研判命名

**Files:**
- Modify: `src/WorkspaceApp.jsx`
- Modify: `src/components/ThemeWorkspace.jsx`
- Modify: `src/data/themeData.js`
- Test: `src/data/themeData.test.js`
- Test: `tests/theme-workspace.spec.js`

**Interfaces:**
- `THEME_NAMES` 输出：黄金、AI与半导体、红利基金、债券基金、港股科技。
- 导航文本为“主题研判”；主标题为“主题研判总览”；副标题包含“当前聚焦五个首批主题”。

- [ ] **Step 1: 写命名失败测试**

在 `themeData.test.js` 断言 `dividend` 为“红利基金”、`bond` 为“债券基金”；在 E2E 中断言页面包含“主题研判”“主题研判总览”，不包含导航文本“五主题研判”。

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test src/data/themeData.test.js`
Expected: FAIL，现有名称仍为“红利”“债券”。

- [ ] **Step 3: 修改最小文案**

只修改 `THEME_NAMES`、导航、标题和范围副标题；不改变主题 ID 或数据文件结构。

- [ ] **Step 4: 运行单元与浏览器测试确认 GREEN**

Run: `node --test src/data/themeData.test.js`

Run: `npm.cmd run test:e2e -- tests/theme-workspace.spec.js`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/WorkspaceApp.jsx src/components/ThemeWorkspace.jsx src/data/themeData.js src/data/themeData.test.js tests/theme-workspace.spec.js
git commit -m "feat: rename theme research workspace"
```

### Task 3: 主题基金联表、排序和简析

**Files:**
- Create: `src/data/themeFunds.js`
- Create: `src/data/themeFunds.test.js`
- Modify: `src/data/themeData.js`
- Modify: `src/data/themeData.test.js`

**Interfaces:**
- `normalizeFundCode(value): string | null`
- `classifyBondFund(fund): '短债' | '纯债' | '混合债' | '可转债' | '债券ETF' | '其他债券基金'`
- `joinThemeFunds(links, fundPayload, { limit = 5 } = {}): Map<string, ThemeFundGroup>`
- `ThemeFundGroup` 为 `{ featured, all, unavailableReason }`。
- 每个基金项包含 `{ code, name, type, matchType, confidence, reviewStatus, matchedRule, bondCategory, analysis, metrics }`。

- [ ] **Step 1: 写联表与排序失败测试**

覆盖六位代码归一化、人工审核优先、置信度排序、最多五只、主数据缺失仍保留基金代码、无映射为空状态。

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test src/data/themeFunds.test.js`
Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现最小联表和可追溯简析**

简析模板必须包含匹配方式与缺失提示，并统一附加“仅用于产品研究，不构成投资建议”。收益、规模、成立日只在源字段存在时进入 `metrics`。

- [ ] **Step 4: 写债券分层测试并确认 RED**

分别输入带“短债”“纯债”“二级债基/混合债”“可转债”“债券ETF”的名称或类型，断言对应分类；不明确记录归入“其他债券基金”。

- [ ] **Step 5: 实现债券分层并跑 GREEN**

Run: `node --test src/data/themeFunds.test.js src/data/themeData.test.js`
Expected: PASS。

- [ ] **Step 6: 将基金数据加入并行加载**

`fetchThemeWorkspace` 使用一个 `Promise.allSettled` 批次读取评分、情景、映射和基金主数据。评分或情景失败仍沿用现有页面错误；映射或基金主数据失败只设置相关基金区域的 `unavailableReason`。

- [ ] **Step 7: 运行数据测试**

Run: `node --test src/data/*.test.js`
Expected: 全部 PASS，无未处理 Promise rejection。

- [ ] **Step 8: 提交**

```powershell
git add src/data/themeFunds.js src/data/themeFunds.test.js src/data/themeData.js src/data/themeData.test.js
git commit -m "feat: join themes with related funds"
```

### Task 4: 相关基金 UI 与跳转

**Files:**
- Create: `src/components/ThemeFunds.jsx`
- Modify: `src/components/ThemeWorkspace.jsx`
- Modify: `src/WorkspaceApp.jsx`
- Modify: `src/workspace.css`
- Test: `tests/theme-workspace.spec.js`

**Interfaces:**
- `ThemeWorkspace({ onOpenFundLibrary })`。
- `ThemeFunds({ theme, group, onOpenFundLibrary })`。
- `onOpenFundLibrary({ query, contextLabel })` 切换基金库并带入来源条件。

- [ ] **Step 1: 写 UI 失败测试**

展开每个主题后断言存在“相关基金”；黄金主题显示基金代码、匹配方式和研究免责声明；点击基金后切换到基金产品库且搜索框带入该代码；映射不可用时显示局部降级文案。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm.cmd run test:e2e -- tests/theme-workspace.spec.js`
Expected: FAIL，相关基金组件尚不存在。

- [ ] **Step 3: 实现相关基金组件**

默认渲染 `featured` 五只；显示名称、代码、类型、置信度、自动/人工标识、可用指标和简析。债券主题显示分层标签。“查看全部相关基金”传递主题名称作为上下文，不在本期增加新路由。

- [ ] **Step 4: 增加响应式样式并跑 GREEN**

Run: `npm.cmd run test:e2e -- tests/theme-workspace.spec.js tests/mobile-layout.spec.js`
Expected: PASS，移动端基金卡片单列显示且无横向溢出。

- [ ] **Step 5: 提交**

```powershell
git add src/components/ThemeFunds.jsx src/components/ThemeWorkspace.jsx src/WorkspaceApp.jsx src/workspace.css tests/theme-workspace.spec.js
git commit -m "feat: show related funds in theme research"
```

### Task 5: 全量验证与 Preview

**Files:**
- Verify only unless a failing test identifies an in-scope defect.

**Interfaces:**
- Vercel must build commit HEAD with `npm run build` and publish `dist`.

- [ ] **Step 1: 运行完整本地验证**

```powershell
npm.cmd run build
npm.cmd run test:e2e -- tests/theme-workspace.spec.js tests/mobile-layout.spec.js
node --test src/data/*.test.js
& $py -m pytest tests/data_pipeline tests/scoring tests/forecasting -q
& $py scripts/test_update_active_funds.py
git diff --check
```

Expected: 构建成功；浏览器测试全部通过；Node、Python 测试零失败；工作树干净。

- [ ] **Step 2: 推送并等待 Vercel Preview**

```powershell
git push
npx.cmd vercel ls ai-fund-mate
```

Expected: 最新提交对应 Preview 为 `Ready`。

- [ ] **Step 3: 检查构建日志与 PR**

```powershell
npx.cmd vercel inspect --logs <preview-url>
```

Expected: 日志明确执行 `vite build` 并生成 `dist/index.html`；GitHub PR 保持 `mergeable_state: clean`。不自动合并。

