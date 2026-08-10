# AI虚拟产品经理同事（AI Fund Mate）技术设计

**日期：** 2026-08-07  
**状态：** 已批准设计，待书面规格复核  
**项目类型：** 纯前端单页应用（SPA）

## 1. 目标与范围

AI Fund Mate 是一个面向公募基金浏览和搜索的轻量网页应用。页面顶部提供具有加载、思考和反馈状态的“AI 虚拟产品经理同事”交互区，主体提供基金列表与卡片双视图。

首版目标：

- 从 `https://LST-Serendipity.github.io/fund-data-api/funds_simple.json` 获取每日更新的公开基金数据。
- 展示基金代码、名称、单位净值和日涨跌幅。
- 支持代码和名称搜索、涨跌方向筛选、代码/净值/涨跌幅排序。
- 支持列表和卡片视图切换，并记忆用户选择。
- 使用本地确定性规则解析扩展版自然语言组合指令，不调用大模型或后端服务。
- 在网络异常时使用合格的本地缓存降级，并明确数据来源和更新时间。

首版不包含账户、自选基金、交易、历史净值曲线、基金详情页、服务端代理或真实大模型对话。

## 2. 技术约束与选型

- React 18、TypeScript、Vite。
- CSS Modules 负责组件样式，普通 CSS 文件提供全局 reset 与设计 token。
- 使用 React 内置 hooks 和 `useReducer`，不引入 Redux 或 Zustand。
- 使用 Vitest、React Testing Library、user-event 和 MSW 测试。
- 建议使用 Playwright 编写关键路径端到端冒烟测试。
- 应用部署为静态资源；运行时直接请求公开数据 API。

## 3. 总体架构

数据流为：

```text
funds_simple.json
  -> fundApi（请求、超时、HTTP 检查）
  -> normalizeFunds（字段归一化与有效性检查）
  -> useFundData（网络、缓存、加载、刷新和错误状态）
  -> fundSelectors（搜索、筛选、排序、统计）
  -> FundList / FundCardGrid

AssistantPanel
  -> intentParser（确定性本地解析）
  -> ParsedIntent
  -> fundReducer 的 APPLY_INTENT
  -> 筛选标签、反馈文案和基金结果同步更新
```

边界原则：

- API 层只处理外部数据和传输错误。
- domain 层定义内部稳定类型。
- 解析器只解释指令，不读写 React 状态、DOM 或缓存。
- reducer 只变更查询状态，不保存派生结果。
- selector 只计算结果，不修改原始基金数组。
- 展示组件只接收准备好的数据和事件回调。

## 4. 领域模型

```ts
interface Fund {
  code: string
  name: string
  nav: number | null
  dailyChangePercent: number | null
  updatedAt: string | null
}

type TrendFilter = 'all' | 'up' | 'down' | 'flat'
type SortField = 'default' | 'dailyChangePercent' | 'nav' | 'code'
type SortDirection = 'asc' | 'desc'
type ViewMode = 'list' | 'card'

interface FundQueryState {
  keyword: string
  trend: TrendFilter
  sortField: SortField
  sortDirection: SortDirection
  viewMode: ViewMode
}

interface ParsedIntent {
  keyword?: string
  trend?: Exclude<TrendFilter, 'all'>
  sortField?: Exclude<SortField, 'default'>
  sortDirection?: SortDirection
  confidence: 'high' | 'medium' | 'low'
  recognizedParts: string[]
  unrecognizedParts: string[]
}
```

外部字段先归一化为 `Fund`。净值或涨跌幅缺失时保留该基金并显示 `--`，排序时将缺失值放在末尾。基金代码统一保存为字符串，以保留前导零。

## 5. 文件与组件拆分

```text
src/
├─ app/
│  ├─ App.tsx
│  └─ App.module.css
├─ domain/
│  └─ fund.ts
├─ api/
│  ├─ fundApi.ts
│  └─ normalizeFund.ts
├─ features/
│  ├─ assistant/
│  │  ├─ AssistantPanel.tsx
│  │  ├─ AssistantPanel.module.css
│  │  ├─ AssistantStatus.tsx
│  │  ├─ IntentChips.tsx
│  │  ├─ intentParser.ts
│  │  └─ intentTypes.ts
│  └─ funds/
│     ├─ FundExplorer.tsx
│     ├─ FundToolbar.tsx
│     ├─ FundSearchInput.tsx
│     ├─ FundFilters.tsx
│     ├─ FundSortControl.tsx
│     ├─ FundViewToggle.tsx
│     ├─ FundResults.tsx
│     ├─ FundList.tsx
│     ├─ FundListRow.tsx
│     ├─ FundCardGrid.tsx
│     ├─ FundCard.tsx
│     ├─ FundStateView.tsx
│     ├─ FundExplorer.module.css
│     ├─ fundReducer.ts
│     └─ fundSelectors.ts
├─ hooks/
│  ├─ useFundData.ts
│  └─ useResponsiveDefaultView.ts
├─ shared/
│  ├─ cache/fundCache.ts
│  ├─ format/fundFormatters.ts
│  └─ constants.ts
├─ styles/
│  ├─ globals.css
│  └─ tokens.css
├─ test/setup.ts
├─ main.tsx
└─ vite-env.d.ts
```

主要职责：

- `App`：页面外壳、品牌区域和全局错误边界。
- `FundExplorer`：组合业务组件，是 AI 区域和基金区域的协调边界。
- `AssistantPanel`：管理输入和短生命周期反馈状态，提交文本并展示解析结果。
- `FundToolbar`：组合普通搜索、涨跌筛选、排序及视图切换。
- `FundResults`：选择骨架、错误、空结果、列表或卡片状态。
- `FundList`、`FundCardGrid`：只渲染已过滤和排序的数据。
- `fundReducer`：集中处理查询状态和组合意图。
- `fundSelectors`：执行过滤、排序和统计。
- `intentParser`：把自然语言转换为 `ParsedIntent`。

## 6. 状态管理

远程数据由 `useFundData` 管理：

```ts
interface FundDataState {
  funds: Fund[]
  status: 'idle' | 'loading' | 'refreshing' | 'success' | 'error'
  source: 'network' | 'cache' | null
  error: string | null
  lastUpdatedAt: string | null
}
```

查询状态由 `useReducer` 管理：

```ts
type FundQueryAction =
  | { type: 'SET_KEYWORD'; payload: string }
  | { type: 'SET_TREND'; payload: TrendFilter }
  | { type: 'SET_SORT'; payload: { field: SortField; direction: SortDirection } }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'APPLY_INTENT'; payload: ParsedIntent }
  | { type: 'REMOVE_FILTER'; payload: 'keyword' | 'trend' | 'sort' }
  | { type: 'RESET_QUERY' }
```

`APPLY_INTENT` 在一次更新中原子性应用关键词、方向和排序。普通工具栏与 AI 指令共享同一个 reducer，因此两种入口始终同步。

AI 面板保存短生命周期 UI 状态：

```ts
interface AssistantUiState {
  input: string
  phase: 'idle' | 'thinking' | 'success' | 'partial' | 'unrecognized'
  response: string
}
```

提交后显示 300–500ms 的轻量“思考中”反馈。新提交会取消旧计时器，防止旧响应覆盖新输入。该动画只表达界面正在处理本地指令，不宣称发生真实模型推理。

## 7. 本地指令解析

解析器按确定性管线执行：

1. 去除首尾空格，统一中文标点，英文转为小写。
2. 匹配独立的 6 位数字作为基金代码。
3. 将“上涨、涨、红、正收益”映射为 `up`。
4. 将“下跌、跌、绿、负收益”映射为 `down`。
5. 将“平盘、持平、零涨跌”映射为 `flat`。
6. 将“涨幅最高、涨得最多”映射为涨跌幅降序。
7. 将“跌幅最大、跌得最多”映射为涨跌幅升序。
8. 将“净值最高/最低”映射为净值降序/升序。
9. 从“名称含、包含、带有、查找、搜索”等句式中提取名称关键词。
10. 输出已识别和未识别片段，并计算置信度。

示例：

```text
输入：查找名称含消费、今日上涨且涨幅最高的基金
输出：keyword=消费, trend=up,
      sortField=dailyChangePercent, sortDirection=desc,
      confidence=high
```

冲突处理采用“更具体规则优先；同类条件以后出现者覆盖先出现者”。若一句话同时包含两种排序，以最后出现的排序为准，反馈文案明确说明实际执行条件。

- `high`：关键片段全部识别，直接执行。
- `medium`：执行可靠部分，同时展示被忽略内容。
- `low`：不改变当前筛选，并给出可用示例。

## 8. 缓存策略

使用 Cache Storage 保存完整数据响应，避免完整基金数组进入同步、容量较小的 `localStorage`。`localStorage` 只保存视图偏好和缓存元信息。

```text
Cache Storage
  ai-fund-mate-data-v1 / funds-simple

localStorage
  ai-fund-mate:view-mode
  ai-fund-mate:cache-meta
```

```ts
interface FundCacheMeta {
  schemaVersion: 1
  fetchedAt: string
  recordCount: number
}
```

采用 stale-while-revalidate：

- 有缓存时先渲染缓存，再后台请求最新数据。
- 24 小时内缓存视为新鲜可用。
- 24 小时至 7 天的缓存只作为网络失败时的降级数据，并明确显示更新时间。
- 超过 7 天时不自动作为可信结果展示；错误页允许用户手动选择使用。
- 网络响应为空、格式错误或有效记录比例异常时，不覆盖旧缓存。
- 网络成功并通过校验后，替换缓存及元信息。

视图偏好规则：首次访问通过 `matchMedia('(max-width: 767px)')` 决定移动端卡片、桌面端列表。用户主动切换后保存偏好，后续窗口尺寸变化不覆盖用户选择。

## 9. 请求与异常处理

- 首次加载显示骨架，AI 提交按钮暂时禁用。
- 后台刷新保留现有结果并显示轻量刷新状态。
- 网络失败且有合格缓存时继续展示，并明确缓存时间。
- 网络失败且无缓存时展示可重试错误状态。
- 数据格式异常显示面向用户的说明，不暴露技术堆栈。
- 搜索无结果时保留筛选标签，并提供清除条件入口。
- 解析部分成功时只执行可靠条件。
- 使用 `AbortController` 取消卸载或重复请求。
- 净值或涨跌幅缺失时显示 `--`，不视为零。

## 10. 性能方案

- 数据只在网络或缓存读取时归一化一次。
- 通过 `useMemo` 缓存过滤、排序和统计结果。
- 普通搜索输入采用 200ms 防抖，AI 指令提交不防抖。
- 基金代码精确匹配优先于名称模糊匹配。
- 使用基金代码作为稳定 React key。
- 排序前复制数组，禁止修改原始基金集合。
- 首版每批展示 50 条并提供“加载更多”，不引入虚拟列表依赖。
- 切换筛选条件时将可见数量重置为 50。
- 只有实际性能测试表明需要时，后续才引入虚拟列表。

## 11. 页面与交互设计

顶部 AI 区域包含品牌名、英文副标题、状态、输入框、提交按钮和快捷指令。主体依次为数据更新时间、工具栏、生效条件标签、结果数量、基金结果和加载更多区域。

状态包括：待命、正在理解、已完成、部分识别和无法识别。AI 状态通过 `aria-live="polite"` 播报。

上涨使用红色，下跌使用绿色，以符合中国基金市场习惯；同时保留正负号和文字/图标，避免只依赖颜色表达。思考动画尊重 `prefers-reduced-motion`。

列表使用语义化表格，卡片使用列表语义。全部输入具有关联标签，图标按钮提供 `aria-label`，键盘可以完成搜索、筛选、排序、切换视图和清除条件。文字与背景达到 WCAG AA 对比度。

## 12. 测试策略

单元测试覆盖：

- 外部数据字段归一化和无效记录处理。
- 净值、涨跌幅和缺失值格式化。
- 搜索、趋势筛选、缺失值排序。
- reducer 单条件、组合条件、撤销和重置。
- 解析器同义词、组合句、冲突、部分识别和无法识别。
- 缓存新鲜度、过期判断和 schema 版本。

组件测试覆盖：

- 首次加载、后台刷新、缓存降级和无缓存错误。
- 普通工具栏与 AI 指令状态同步。
- 组合指令生成多个筛选标签。
- 列表/卡片切换及偏好恢复。
- 旧提交计时器不会覆盖新结果。
- 移动端默认视图和用户偏好优先级。

Playwright 冒烟测试覆盖：

1. 打开页面并展示基金数据。
2. 提交“查找名称含消费、今日上涨且涨幅最高的基金”。
3. 验证筛选标签、排序方向和结果趋势。
4. 切换视图并刷新，验证偏好仍然生效。
5. 模拟网络失败，验证缓存降级提示。

## 13. 初始化命令与依赖

要求 Node.js 20 LTS 或更高版本、npm 10 或更高版本。

```powershell
npm create vite@latest ai-fund-mate -- --template react-ts
Set-Location ai-fund-mate
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event msw
npm install -D @playwright/test
npx playwright install chromium
```

Vite 当前模板可能安装高于 React 18 的版本。为严格满足 React 18 约束，初始化后固定 React 版本：

```powershell
npm install react@18.3.1 react-dom@18.3.1
npm install -D @types/react@18 @types/react-dom@18
```

不需要生产环境第三方状态库、请求库、自然语言处理库或 CSS 框架。网络请求使用浏览器 `fetch`，状态管理使用 React 内置能力。

建议补充脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "preview": "vite preview"
  }
}
```

## 14. 验收标准

- 从指定 API 获取并展示基金代码、名称、单位净值和日涨跌幅。
- 代码和名称搜索响应流畅，支持上涨、下跌和平盘筛选。
- 支持按代码、净值和涨跌幅排序。
- 支持列表和卡片视图，刷新后恢复用户选择。
- 组合自然语言指令一次应用关键词、趋势和排序条件。
- AI 区域明确呈现加载、思考、成功、部分识别和失败状态。
- 网络失败时按缓存新鲜度规则降级，并显示数据时间及来源。
- 核心领域逻辑有单元测试，关键交互有组件测试。
- 桌面和移动端无明显横向溢出，键盘交互完整。
- `npm run test`、`npm run build` 和 TypeScript 检查通过。

## 15. 已明确的实施前验证

实现数据归一化器前，必须使用一次真实响应或仓库公开说明确认 `funds_simple.json` 的实际字段名、数字格式、日期格式及 CORS 行为。内部 `Fund` 类型和上述用户体验不变；任何外部字段差异仅在 `normalizeFund.ts` 中适配。
