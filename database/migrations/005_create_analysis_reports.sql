begin;

set local search_path = history, public;

create table if not exists analysis_reports (
  id bigint generated always as identity primary key,
  analysis_key text not null,
  data_date date not null,
  facts_hash text not null,
  source text not null check (source in ('model', 'codex-manual', 'rule-fallback')),
  provider text,
  model text,
  prompt_version text not null default 'v1',
  report jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_key, data_date, facts_hash, prompt_version)
);

create index if not exists analysis_reports_latest_idx
  on analysis_reports (analysis_key, data_date desc, updated_at desc);

revoke all on analysis_reports from public;
grant select, insert, update on analysis_reports to history_pipeline_writer;
grant select on analysis_reports to history_api_reader;
grant usage, select on sequence analysis_reports_id_seq to history_pipeline_writer;

insert into analysis_reports
  (analysis_key, data_date, facts_hash, source, provider, model, prompt_version, report)
values
  ('market-forecast', '2026-08-31', 'codex-manual-2026-08-31-market-forecast', 'codex-manual', 'codex', 'gpt-5', 'v1',
   '{"headline":"风险偏好扩散，但资金仍呈权益进攻与固收防守并存","overallJudgment":"截至2026-08-31，多数可比分类收益中枢为正，科技、主动混合和黄金资源获得规模增量，显示风险偏好正在扩散；与此同时，债券基金规模净增仍显著，说明资金并未转为单一进攻状态。产品规划宜增加宽基与景气主线的差异化供给，同时用回撤和资金广度约束高波动主题的立项节奏。","changeAttribution":["科技、主动混合和黄金资源的正向规模变化共同推动权益侧风险偏好改善。","债券基金仍承接较大规模增量，反映稳健资金需求没有消失。","宽基规模净增偏弱而科技收益居前，市场改善更多来自结构性主题与主动产品，而非全面指数化扩张。"],"risks":["科技与黄金资源方向的回撤中位数较深，历史收益不能线性外推。","规模数据存在披露与估算时滞，短期变化不应直接解释为当日净申购。","若收益扩散不能转化为更广泛的规模正增长，当前风险偏好判断可能弱化。"],"nextActions":["连续跟踪科技、主动混合和宽基的规模净增额与正增长广度。","观察正收益分类占比是否维持在50%以上，并同步监测回撤是否继续加深。","在新产品立项前比较同类供给密度、头部集中度与存量产品持有人体验。"]}'::jsonb)
on conflict (analysis_key, data_date, facts_hash, prompt_version) do nothing;

commit;
