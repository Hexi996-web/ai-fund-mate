# AI Fund Mate 历史数据平台

本目录只保存数据库结构和迁移文件，不保存密码、生产数据或数据库导出文件。所有新表位于独立的 `history` schema，避免与现有信号管线的 `public.pipeline_runs` 等旧表冲突。

## 目录约定

- `migrations/`：按编号顺序执行、提交到 Git 的 PostgreSQL 迁移。
- `public/` 只保留当前页面快照和少量故障回退历史，完整历史不再随 Git 累计。
- 标准化历史数据由 `scripts/history/import_daily_snapshots.py` 导入。
- 注意力原始样本保存在 `attention_raw_samples`，页面历史通过 `/api/history/research` 按需读取。

## 数据层次

1. `pipeline_runs` 与 `data_snapshots` 记录任务运行、文件哈希和导入状态。
2. `fund_products`、`fund_shares`、`research_themes` 保存低频变化的主体数据。
3. `*_daily_*` 表保存不可丢失的每日观测与版本化指标。
4. `strategy_*` 表保存可复现的策略定义、运行参数、每日结果和持仓。
5. `analysis_reports` 保存按数据日期、事实哈希和提示词版本生成的模型或人工简报，避免重复调用模型并支持历史比较。

重要时间字段：

- `data_date`：数据描述的市场日期。
- `source_updated_at`：上游发布或快照生成时间。
- `ingested_at`：本系统实际获得数据的时间，用于防止回测未来数据泄漏。

## 执行迁移

安装 PostgreSQL 客户端后，按顺序执行：

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_create_history_platform.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/002_create_read_models.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/003_create_application_roles.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/004_store_attention_raw_history.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/005_create_analysis_reports.sql
```

生产环境必须使用连接池地址；迁移任务可使用数据库的直接连接地址。
为自动化写入账号授予 `history_pipeline_writer`，为 API 登录账号授予 `history_api_reader`。

也可执行 `python -m scripts.history.apply_migrations`。该命令使用 `history_schema_migrations` 记录迁移版本及校验和，支持安全重复运行。

每日数据工作流会自动先运行该迁移命令，再累计当天快照；正常情况下无需人工操作。

## 自动历史闭环

定时任务按固定顺序执行：

1. `hydrate_public_history.py` 从 PostgreSQL 恢复计算需要的历史。
2. 数据脚本生成新的完整快照。
3. `import_daily_snapshots.py` 将完整历史和当天观测幂等写入数据库。
4. `compact_public_history.py` 将 GitHub 内公开文件压缩为当前日原始样本、7 日日序列和最近两期排名。

数据库不可用时不会执行压缩，仓库内回退数据会继续保留，避免历史链路故障影响页面当前功能。
