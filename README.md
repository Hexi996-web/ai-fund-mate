# AI Fund Mate

数据库累计、每日导入和历史 API 的部署方式见 [历史数据平台实施说明](docs/history-data-platform.md)。

面向公募基金产品经理的内部工作台。生产站点包含四个核心板块：

| 板块 | 核心数据 | 更新方式 |
| --- | --- | --- |
| 市场分析 | 全市场存量基金、净值、规模与分类统计 | 每日自动更新 |
| 行情预测 | 基于同口径基金收益、回撤与规模变化的市场状态 | 随基金快照每日更新 |
| 发行洞察 | 新发、募集规模及成立后规模轨迹 | 每日自动更新 |
| 预研产品池 | 36个社会注意力方向、动态核心10与产品空位 | 每日更新证据，季度调整母池 |

## 产品经理 Agent

网页右下角提供产品经理 Agent。它会携带当前工作区和数据日期，但不会直接修改数据或执行外部操作。

- 云端模型：通过服务端 `/api/agent/chat` 统一接入任何兼容 OpenAI Chat Completions 的模型服务。Vercel 环境变量需设置 `AGENT_API_KEY`、`AGENT_MODEL`，可选设置 `AGENT_BASE_URL` 和 `AGENT_PROVIDER`。密钥不会进入浏览器代码。
- 本地模型：在 Agent 的“模型设置”中切换至本地 Ollama，默认接口为 `http://127.0.0.1:11434/api/chat`，默认模型为 `qwen3:8b`。Ollama 需要已启动、已下载对应模型，并允许生产站点跨域访问。
- 未配置云端模型时：云端接口明确返回“尚未配置”，用户仍可切换到本地模型；系统不会静默伪造回复。
- 数据上下文：构建前由 `scripts/build_agent_context.mjs` 从最新公开快照生成轻量上下文，按当前工作区只发送相关摘要，避免把数十MB原始数据传给模型。
- 稳定性保护：对话请求设有消息数、单条长度、总体积、45秒超时和服务端基础限流；关闭或清空对话会中止进行中的请求。
- 对象级上下文：Agent会感知当前预研主题、基金筛选、发行时间窗口或行情分类，而不是只知道板块名称。
- 证据追溯：回答可携带当前板块的数据日期和公开快照入口。
- 只读工具：云端模型与支持工具调用的Ollama模型可切换板块、定位主题、设置基金筛选及定位行情分类；前端只执行白名单动作，不开放数据修改和外部操作。

## 生产入口

- 前端入口：`src/workspace-main.jsx` → `src/WorkspaceApp.jsx`
- 每日主任务：`.github/workflows/update-active-funds.yml`
- 基金数据：`scripts/update_active_funds.py`
- 发行洞察：`scripts/update_issuance_insights.py`
- 注意力母池：`scripts/update_attention_pool.py`
- 生产部署校验：`scripts/verify_deployed_snapshot.py`、`scripts/verify_deployed_interface.mjs`

主任务支持 `workflow_dispatch` 手动运行，并在北京时间每日 04:43、05:53、07:03 提供三次自动执行机会。任务只有在数据校验、前端构建、Vercel快照同步和四个页面验收全部通过后才成功。社会注意力原则上每两小时更新，独立新鲜度守卫会在调度缺失时补触发；本机还配置了第二层更新守卫。

## 本地开发

```bash
npm ci
npm run dev
npm run build
```

数据脚本依赖安装：

```bash
python -m pip install -r requirements-data.txt
```

## 仓库边界

- `public/*.json` 是生产发布快照，由自动任务维护。
- `docs/superpowers/` 保留早期方案与设计记录，仅作历史参考，不代表当前生产架构。
- 已弃用的“五主题研究”和“信号雷达”运行链路已从主线移除；如需追溯，可通过Git历史和已合并PR查看。
- 新功能必须接入四个现有工作区之一，或在新增工作区时同时补充数据生成、数据新鲜度校验和生产界面验收。
