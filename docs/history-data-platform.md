# AI Fund Mate 历史数据平台实施说明

## 1. 目标

在不停止现有每日 JSON 发布的前提下，将快照累计到 PostgreSQL，支持历史比较、时间序列研究和可复现策略验证。JSON 是兼容输出和原始证据，PostgreSQL 是标准化查询层。

## 2. 清晰边界

```text
scripts/update_*.py                  数据采集与快照生成
scripts/history/                     历史数据转换与累计导入
database/migrations/                 PostgreSQL 结构版本
api/history/                         浏览器可调用的只读历史 API
public/*.json                        当前网页兼容快照
```

不要在 `src/` 中连接数据库，不要创建 `VITE_DATABASE_URL`，也不要把数据库密码写入 JSON、前端代码或 Git。

## 3. 首次部署

1. 创建 PostgreSQL 15 或更新版本的数据库。
2. 使用管理员或迁移账号执行：

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_create_history_platform.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/002_create_read_models.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/003_create_application_roles.sql
```

3. 本地复制 `.env.example` 为 `.env.local`，只填写本地环境；不要提交该文件。
4. 在 GitHub Actions Secrets 设置 `HISTORY_DATABASE_URL`。为兼容现有部署，导入任务也接受已有的 `SUPABASE_DB_URL`。
5. 在 Vercel 服务端环境设置连接池形式的 `DATABASE_URL`、`DATABASE_POOL_SIZE=3` 和 `DATABASE_SSL=require`。

迁移使用数据库直接连接地址；Vercel API 使用事务连接池地址。生产写入账号加入 `history_pipeline_writer`，只读 API 账号加入 `history_api_reader`，两者不要共用密码。

也可以在 GitHub Actions 手动运行 **Migrate history database**：输入 `MIGRATE` 后，工作流会校验迁移文件、执行尚未应用的迁移、导入当前快照并验证记录数。迁移执行器将每个文件的 SHA-256 写入 `history_schema_migrations`；已执行的迁移不得原地修改，应新增下一个编号文件。

日常运行不需要手动迁移。每日 **Update active fund data** 会在历史导入前自动执行迁移检查：新迁移自动应用，已执行迁移自动跳过，校验和不一致则停止写入并保留旧数据。数据库 advisory lock 防止每日任务与恢复任务同时迁移。手动工作流仅用于首次即时启动或故障恢复。

## 4. 首次导入与每日导入

不连接数据库的结构检查：

```bash
python -m scripts.history.import_daily_snapshots --source-dir public --dry-run
```

首次导入：

```bash
python -m scripts.history.import_daily_snapshots --source-dir public
```

需要在本地同时压缩归档原始快照时：

```bash
python -m scripts.history.import_daily_snapshots \
  --source-dir public \
  --archive-dir .local-data/snapshot-archive
```

生产归档应使用有版本控制和生命周期策略的对象存储；不要把逐日压缩文件提交到 Git。导入以数据集日期、文件哈希和业务主键保持幂等，同一天重复运行不会产生重复事实行。

## 5. 已提供的历史 API

- `GET /api/history/status`
- `GET /api/history/funds?code=000001&from=2026-01-01&to=2026-08-31`
- `GET /api/history/themes?themeId=ai-agent&from=2026-01-01&to=2026-08-31`

所有 API 都有参数校验、行数上限和短时间公共缓存。前端下一阶段应逐页调用这些接口，但当前 JSON 路径继续工作，因此本次数据库配置不会阻断网站。

## 6. 策略验证约束

策略运行必须记录策略版本、参数、源代码哈希、回测区间、`data_cutoff`、基准和交易成本假设。读取历史数据时同时限制 `data_date` 与 `ingested_at <= data_cutoff`，防止使用当时尚未获得的数据。

不要删除终止基金历史，不要用今天的基金分类覆盖历史分类，不要在评分方法升级时覆盖旧的 `methodology_version`。这些约束用于降低未来数据泄漏、存续偏差和指标版本漂移。

## 7. 上线验收

1. 两个迁移均成功执行。
2. `--dry-run` 能识别七个数据集及日期。
3. 首次导入后 `pipeline_runs.status = 'succeeded'`。
4. 再运行一次，历史事实表行数不重复增长。
5. `/api/history/status` 返回最新运行和各数据集日期。
6. 基金与主题历史 API 只能读取，不能写入。
7. 不配置数据库时，现有四个工作区仍能使用 JSON 正常展示。
