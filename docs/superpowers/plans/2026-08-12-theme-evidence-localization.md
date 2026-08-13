# Theme Evidence Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将主题证据、缺口状态和影响说明完整中文化，并修复页面字面量换行缺陷。

**Architecture:** 新建纯函数解释模块，组件只负责渲染已本地化的数据。底层评分 JSON 与算法保持不变。

**Tech Stack:** React 18、Vite、Node test runner、Playwright。

## Global Constraints

- 不修改评分算法或历史快照。
- 未识别内部代码不得直接展示，统一使用中文兜底。
- 缺口说明必须同时提供原因与影响。

---

### Task 1: 中文解释模块

**Files:**
- Create: `src/data/evidenceLocalization.js`
- Create: `src/data/evidenceLocalization.test.js`

- [ ] 写失败测试，覆盖已知规则、指标、缺口状态及未知值兜底。
- [ ] 运行 `node --test src/data/evidenceLocalization.test.js`，确认模块缺失导致 RED。
- [ ] 实现 `localizeRule`、`localizeEvidence`、`explainGap`。
- [ ] 重跑测试确认 GREEN。

### Task 2: 主题详情接入

**Files:**
- Modify: `src/components/ThemeWorkspace.jsx`
- Modify: `tests/theme-workspace.spec.js`

- [ ] 写浏览器失败断言：中文板块标题存在，技术代码与英文规则不存在。
- [ ] 运行目标 E2E 确认 RED。
- [ ] 接入解释函数并删除字面量 `` `n ``。
- [ ] 重跑 E2E 确认 GREEN。

### Task 3: 全量验证与 Preview

**Files:**
- Verify all changed files.

- [ ] 运行 Vite 构建、全部 Node 数据测试和主题/导航 E2E。
- [ ] 运行 Python 数据、评分与预测测试。
- [ ] 提交、推送分支并确认 Vercel Preview 为 Ready。

