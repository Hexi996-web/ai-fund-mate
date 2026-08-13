# 基金产品与份额模型实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将基金库升级为稳定的 `productId + shareClass` 两层模型，默认展示基金产品并可展开查看全部份额。

**Architecture:** Python 数据管道负责保守识别份额类别、生成稳定产品 ID、选择代表份额，并输出产品数据和质量审计文件；React 前端只消费已归并产品，不在浏览器端执行模糊归并。旧份额文件继续保留，新产品文件不可用时安全降级为“一代码一产品”。

**Tech Stack:** Python 3.12、unittest/pytest、AKShare、React 18、Vite、Node `node:test`、Playwright。

## Global Constraints

- 默认按基金产品展示，展开后查看 A/C/E/Y 等份额。
- 代表份额优先级为 A 类、人民币默认份额、C 类、其他明确份额、六位代码升序。
- ETF 与 ETF联接、普通与发起式、不同定开或持有期限、币种和对冲属性不得模糊合并。
- 不因缺少日涨跌幅而剔除基金。
- `productId` 必须跨日稳定，格式为 `prd_<16位十六进制摘要>`，摘要输入为 `v1|规范化产品名|规范化基金类型`。
- `funds_active.json` 保留旧字段并增量加入产品字段；新增 `fund_products.json` 和 `funds_grouping_review.json`。
- 旧前端缓存必须因 schema 版本升级而失效。
- 免费公开数据源优先，不新增付费服务。

---

## 文件结构

- Create: `scripts/fund_product_model.py` — 纯函数形式的份额解析、产品键、归并、代表份额和审计逻辑。
- Create: `scripts/test_fund_product_model.py` — Python 单元测试。
- Modify: `scripts/update_active_funds.py` — 调用模型并原子输出三类基金文件。
- Modify: `scripts/test_update_active_funds.py` — 数据生成与输出契约测试。
- Modify: `.github/workflows/update-active-funds.yml` — 提交新增产物并运行数据测试。
- Create: `src/data/fundProductModel.js` — 产品 JSON 归一化、旧份额安全降级、搜索与排序。
- Create: `src/data/fundProductModel.test.js` — 产品选择逻辑测试。
- Modify: `src/data/fundData.js`、`src/data/fundData.test.js` — 产品文件优先与回退。
- Modify: `src/data/fundCache.js`、`src/data/fundCache.test.js` — v4 产品缓存。
- Create: `src/components/FundProductViews.jsx` — 产品卡、产品表格与份额展开。
- Modify: `src/App.jsx`、`src/App.css` — 产品级状态、计数、搜索提示和响应式样式。
- Create: `tests/fund-products.spec.js` — 产品口径端到端测试。

### Task 1: 份额类别与稳定产品标识

**Files:**
- Create: `scripts/fund_product_model.py`
- Create: `scripts/test_fund_product_model.py`

**Interfaces:**
- Produces: `parse_share_identity(name: str) -> ShareIdentity`，其中 `ShareIdentity(product_name, share_class, confidence, rule)`。
- Produces: `make_product_id(product_name: str, fund_type: str) -> str`。

- [ ] **Step 1: 写失败测试**

覆盖 `示例基金A -> 示例基金/A/high/explicit_share_suffix`、`示例基金美元现汇 -> USD_SPOT`、无后缀为 `DEFAULT`，并断言 ETF联接、发起式、三年持有期仍保留在 `product_name` 中。稳定 ID 测试断言相同输入一致、不同类型不同、格式匹配 `^prd_[0-9a-f]{16}$`。

- [ ] **Step 2: 验证测试失败**

Run: `python -m pytest scripts/test_fund_product_model.py -q`  
Expected: FAIL，模块 `fund_product_model` 尚不存在。

- [ ] **Step 3: 实现最小纯函数**

在 `fund_product_model.py` 定义冻结 dataclass `ShareIdentity`；用显式尾部正则表识别字母、人民币、美元现汇和美元现钞；以 `hashlib.sha256(f"v1|{product_name}|{fund_type}".encode()).hexdigest()[:16]` 生成 ID。只规范空白、括号和英文大小写，不删除经济属性词。

- [ ] **Step 4: 验证通过**

Run: `python -m pytest scripts/test_fund_product_model.py -q`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/fund_product_model.py scripts/test_fund_product_model.py
git commit -m "feat: identify fund products and share classes"
```

### Task 2: 产品归并、冲突隔离与代表份额

**Files:**
- Modify: `scripts/fund_product_model.py`
- Modify: `scripts/test_fund_product_model.py`

**Interfaces:**
- Consumes: `parse_share_identity`、`make_product_id`。
- Produces: `build_products(shares: list[dict]) -> tuple[list[dict], dict]`。
- Audit keys: `shareTotal`、`productTotal`、`groupingRate`、`ruleCounts`、`lowConfidence`、`conflicts`。

- [ ] **Step 1: 写失败测试**

构造 A/C 两份额断言合为一产品；A 被选为 `representativeCode`；没有 A 时 DEFAULT 优先于 C。构造同主名但基金类型冲突，断言拆成一代码一产品、`groupingConfidence=low` 且进入 `conflicts`。断言每个 code 只出现一次、`shareCount == len(shares)`。

- [ ] **Step 2: 验证失败**

Run: `python -m pytest scripts/test_fund_product_model.py -q`  
Expected: FAIL，`build_products` 尚不存在。

- [ ] **Step 3: 实现归并**

先为每个份额附加五个产品字段，再按 `productId` 分组；同组类型集合大于1或重复 `shareClass` 时拆分为低置信度单份额产品。代表份额排序键固定为 `A=0, DEFAULT/RMB=1, C=2, 其他明确=3, UNKNOWN=4`，次键为 code。

- [ ] **Step 4: 验证通过**

Run: `python -m pytest scripts/test_fund_product_model.py -q`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/fund_product_model.py scripts/test_fund_product_model.py
git commit -m "feat: group fund shares into products"
```

### Task 3: 数据管道输出产品与审计文件

**Files:**
- Modify: `scripts/update_active_funds.py`
- Modify: `scripts/test_update_active_funds.py`
- Generate: `public/fund_products.json`
- Generate: `public/funds_grouping_review.json`

**Interfaces:**
- Consumes: `build_products(active_funds)`。
- Produces: 份额文件中的五个新增字段、产品文件契约、审计文件契约。

- [ ] **Step 1: 写失败测试**

将脚本中的 JSON 组装抽为 `build_output_payloads(active_funds, excluded_funds, update_time)`。测试断言三个新增 payload 的 totals 一致、代表份额存在、每个活跃 code 恰好出现一次，并验证原份额字段仍存在。

- [ ] **Step 2: 验证失败**

Run: `python -m pytest scripts/test_update_active_funds.py -q`  
Expected: FAIL，函数或产品 payload 不存在。

- [ ] **Step 3: 实现输出契约**

调用 `build_products`，把增强后的 shares 写回 `funds_active.json`，构建 `fund_products.json` 与 `funds_grouping_review.json`。先写同目录 `*.tmp`，全部序列化与完整性断言通过后用 `Path.replace` 覆盖正式文件；失败时保留上一版。

- [ ] **Step 4: 生成一次真实快照并检查**

Run: `python scripts/update_active_funds.py`  
Expected: 输出产品数、份额数、低置信度数；三个 JSON 均可解析，`productTotal < shareTotal`。

- [ ] **Step 5: 验证测试**

Run: `python -m pytest scripts/test_fund_product_model.py scripts/test_update_active_funds.py -q`  
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add scripts public/funds_active.json public/fund_products.json public/funds_grouping_review.json
git commit -m "feat: publish fund product datasets"
```

### Task 4: 自动更新工作流保护

**Files:**
- Modify: `.github/workflows/update-active-funds.yml`

**Interfaces:**
- Consumes: Python 测试与三个数据产物。
- Produces: 日更前测试门禁与完整 Git 提交集合。

- [ ] **Step 1: 写静态失败断言**

在 `scripts/test_update_active_funds.py` 读取 workflow 文本，断言包含 `python -m pytest scripts/test_fund_product_model.py scripts/test_update_active_funds.py -q`，且 `git add` 包含两个新 JSON。

- [ ] **Step 2: 验证失败**

Run: `python -m pytest scripts/test_update_active_funds.py -q`  
Expected: FAIL，workflow 尚未包含新门禁和文件。

- [ ] **Step 3: 修改 workflow**

在生成数据后、提交前运行两组 Python 测试；将 `git add` 扩展为四个生产 JSON。保留北京时间19:00定时任务与 `workflow_dispatch`。

- [ ] **Step 4: 验证通过**

Run: `python -m pytest scripts/test_fund_product_model.py scripts/test_update_active_funds.py -q`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add .github/workflows/update-active-funds.yml scripts/test_update_active_funds.py
git commit -m "ci: validate fund product data updates"
```

### Task 5: 前端产品数据读取与安全降级

**Files:**
- Modify: `src/data/fundData.js`
- Modify: `src/data/fundData.test.js`
- Create: `src/data/fundProductModel.js`
- Create: `src/data/fundProductModel.test.js`

**Interfaces:**
- Produces: `fetchFundProductPayload(fetchImpl, options) -> { payload, source }`。
- Produces: `normalizeProducts(payload) -> Product[]`、`fallbackProductsFromShares(payload) -> Product[]`。

- [ ] **Step 1: 写失败测试**

测试优先请求 `/fund_products.json`；产品文件无效时读取现有活跃份额并按“一代码一产品”降级；AbortError 原样抛出。归一化测试断言非法 totals 被拒绝、代表 code 必须属于 shares。

- [ ] **Step 2: 验证失败**

Run: `node --test src/data/fundData.test.js src/data/fundProductModel.test.js`  
Expected: FAIL，新接口不存在。

- [ ] **Step 3: 实现读取和归一化**

新增 `FUND_PRODUCTS_URL`；严格验证 `productTotal/shareTotal/products`。降级产品使用 `productId=fallback_<code>`、`shareClass=UNKNOWN`、`groupingConfidence=low`，不得在前端猜测名称归并。

- [ ] **Step 4: 验证通过**

Run: `node --test src/data/fundData.test.js src/data/fundProductModel.test.js`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data/fundData.js src/data/fundData.test.js src/data/fundProductModel.js src/data/fundProductModel.test.js
git commit -m "feat: load fund products with safe fallback"
```

### Task 6: 产品搜索、分类与排序

**Files:**
- Modify: `src/data/fundProductModel.js`
- Modify: `src/data/fundProductModel.test.js`

**Interfaces:**
- Produces: `selectProducts(products, options) -> { products, matchedShareCodes }`。

- [ ] **Step 1: 写失败测试**

按产品名、productId、任一份额名称和 code 搜索；搜索 C 类 code 时只返回所属产品且 `matchedShareCodes` 包含该 code。分类和涨跌幅排序使用代表份额，缺失值排末尾。

- [ ] **Step 2: 验证失败**

Run: `node --test src/data/fundProductModel.test.js`  
Expected: FAIL，`selectProducts` 不存在。

- [ ] **Step 3: 实现选择器**

搜索索引由产品字段与全部 shares 字段组合；保持纯函数、不可变排序，并复用现有分类文字规则。

- [ ] **Step 4: 验证通过**

Run: `node --test src/data/fundProductModel.test.js`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data/fundProductModel.js src/data/fundProductModel.test.js
git commit -m "feat: search and sort fund products"
```

### Task 7: 产品缓存 v4

**Files:**
- Modify: `src/data/fundCache.js`
- Modify: `src/data/fundCache.test.js`

**Interfaces:**
- Cache key: `ai-fund-mate:fund-products:v4`。
- Cache payload field: `products`，另含 `productTotal`、`shareTotal`。

- [ ] **Step 1: 写失败测试**

断言 v3 缓存被删除并返回 null；v4 totals 必须与数组及 shares 数一致；读写产品缓存保持日期、来源和数据日期。

- [ ] **Step 2: 验证失败**

Run: `node --test src/data/fundCache.test.js`  
Expected: FAIL，仍使用 v3 份额缓存。

- [ ] **Step 3: 实现缓存升级**

将 schema 升至4并更换 key；只缓存归一化产品。验证失败时删除缓存且不中断网络加载。

- [ ] **Step 4: 验证通过**

Run: `node --test src/data/fundCache.test.js`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data/fundCache.js src/data/fundCache.test.js
git commit -m "feat: cache normalized fund products"
```

### Task 8: 产品卡片、表格与份额展开

**Files:**
- Create: `src/components/FundProductViews.jsx`
- Modify: `src/App.css`
- Create: `tests/fund-products.spec.js`

**Interfaces:**
- `FundProductCards({ products, expandedIds, matchedShareCodes, onToggle })`。
- `FundProductTable({ products, expandedIds, matchedShareCodes, onToggle })`。

- [ ] **Step 1: 写失败端到端测试**

路由 mock 产品 JSON；断言默认一产品一行、显示“代表份额：A类（代码）”；点击“查看2个份额”展开 A/C；按钮具备 `aria-expanded` 与 `aria-controls`；匹配份额带 `data-search-match=true`。

- [ ] **Step 2: 验证失败**

Run: `npx.cmd playwright test tests/fund-products.spec.js`  
Expected: FAIL，产品组件尚不存在。

- [ ] **Step 3: 实现组件与样式**

复用现有格式化函数或将其导出到新组件；产品层显示代表份额指标，子行显示每份额完整指标。移动端采用纵向详情，桌面表格子行使用整行展开区。

- [ ] **Step 4: 验证组件测试**

Run: `npx.cmd playwright test tests/fund-products.spec.js`  
Expected: 暂因 App 未接线而失败在产品数据加载，而非组件导入错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/FundProductViews.jsx src/App.css tests/fund-products.spec.js
git commit -m "feat: add expandable fund product views"
```

### Task 9: 应用切换到产品默认口径

**Files:**
- Modify: `src/App.jsx`
- Modify: `tests/fund-products.spec.js`
- Modify: `tests/mobile-layout.spec.js`

**Interfaces:**
- Consumes: Tasks 5–8 的读取、选择器、缓存和组件。

- [ ] **Step 1: 扩充失败测试**

断言顶部显示“基金产品 X 只｜基金份额 Y 个”；搜索 C 类代码后产品自动展开并突出对应份额；产品数据请求失败时显示降级口径说明；现有移动端卡片仍无横向溢出。

- [ ] **Step 2: 验证失败**

Run: `npx.cmd playwright test tests/fund-products.spec.js tests/mobile-layout.spec.js`  
Expected: FAIL，App 仍使用份额模型。

- [ ] **Step 3: 接入产品状态**

将 `funds` 状态改为 `products`；加载产品 payload、写 v4 缓存、调用 `selectProducts`。维护 `expandedIds: Set`，搜索命中具体份额时自动加入所属 productId。所有用户文案使用“产品/份额”准确口径。

- [ ] **Step 4: 验证通过**

Run: `node --test src/data/*.test.js`  
Run: `npx.cmd playwright test tests/fund-products.spec.js tests/mobile-layout.spec.js tests/workspace-navigation.spec.js`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/App.jsx tests/fund-products.spec.js tests/mobile-layout.spec.js
git commit -m "feat: make fund products the default library view"
```

### Task 10: 全量验证、数据抽查与交付

**Files:**
- Modify only if verification exposes a defect in files already in scope.

- [ ] **Step 1: 运行 Python 全量测试**

Run: `python -m pytest scripts/test_fund_product_model.py scripts/test_update_active_funds.py tests/data_pipeline -q`  
Expected: PASS。

- [ ] **Step 2: 运行 Node 全量数据测试**

Run: `node --test src/data/*.test.js`  
Expected: PASS。

- [ ] **Step 3: 构建**

Run: `npm.cmd run build`  
Expected: Vite build 成功，无缺失资源。

- [ ] **Step 4: 运行 Playwright 全量测试**

Run: `npx.cmd playwright test`  
Expected: PASS。

- [ ] **Step 5: 抽查五主题典型产品**

从生成 JSON 中各抽查黄金、半导体、AI、红利、债券至少一个多份额产品，记录产品名、productId、代表 code、全部 shareClass，确认没有把 ETF 与联接或不同期限产品误合并。

- [ ] **Step 6: 检查质量指标**

断言 `shareTotal == funds_active.total`、`productTotal == products.length`、所有代表份额属于产品、低置信度均进入 review；将产品数与官方统计差异仅作为说明，不作为通过门槛。

- [ ] **Step 7: 提交最终修复**

```bash
git status --short
git add <仅验证阶段产生的范围内修复>
git commit -m "test: verify fund product model"
```

- [ ] **Step 8: 推送并创建 Preview PR**

推送 `codex/fund-product-share-model`，创建以 `main` 为 base 的 PR；等待 Vercel Preview Ready，验证产品数、份额数、展开、代码搜索及中国大陆无需 VPN 可访问，再决定合并。
