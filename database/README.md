# AI Fund Mate 历史数据平台

本目录只保存数据库结构和迁移文件，不保存密码、生产数据或数据库导出文件。

## 目录约定

- `migrations/`：按编号顺序执行、提交到 Git 的 PostgreSQL 迁移。
- 原始每日 JSON 继续由 `public/` 生成，并应另行归档到对象存储。
- 标准化历史数据由 `scripts/history/import_daily_snapshots.py` 导入。

## 数据层次

1. `pipeline_runs` 与 `data_snapshots` 记录任务运行、文件哈希和导入状态。
2. `fund_products`、`fund_shares`、`research_themes` 保存低频变化的主体数据。
3. `*_daily_*` 表保存不可丢失的每日观测与版本化指标。
4. `strategy_*` 表保存可复现的策略定义、运行参数、每日结果和持仓。

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
```

生产环境必须使用连接池地址；迁移任务可使用数据库的直接连接地址。
为自动化写入账号授予 `history_pipeline_writer`，为 API 登录账号授予 `history_api_reader`。

也可执行 `python -m scripts.history.apply_migrations`。该命令使用 `history_schema_migrations` 记录迁移版本及校验和，支持安全重复运行。

每日数据工作流会自动先运行该迁移命令，再累计当天快照；正常情况下无需人工操作。
