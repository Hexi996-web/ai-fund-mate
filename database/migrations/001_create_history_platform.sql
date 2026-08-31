begin;

create table if not exists pipeline_runs (
  id bigint generated always as identity primary key,
  run_key text not null unique,
  pipeline_name text not null,
  data_date date not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_commit text,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists pipeline_runs_date_status_idx
  on pipeline_runs (data_date desc, status);

create table if not exists data_snapshots (
  id bigint generated always as identity primary key,
  pipeline_run_id bigint references pipeline_runs(id),
  dataset_name text not null,
  snapshot_date date not null,
  schema_version integer not null default 1,
  storage_path text not null,
  content_hash text not null,
  row_count integer,
  generated_at timestamptz,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (dataset_name, snapshot_date, content_hash)
);

create index if not exists data_snapshots_run_id_idx
  on data_snapshots (pipeline_run_id);
create index if not exists data_snapshots_dataset_date_idx
  on data_snapshots (dataset_name, snapshot_date desc);

create table if not exists fund_products (
  product_id text primary key,
  product_name text not null,
  fund_type text,
  established_date date,
  first_seen_date date not null,
  last_seen_date date not null,
  is_active boolean not null default true,
  grouping_confidence text,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists fund_products_type_active_idx
  on fund_products (fund_type, is_active);
create index if not exists fund_products_name_idx
  on fund_products (product_name);

create table if not exists fund_shares (
  fund_code text primary key check (fund_code ~ '^[0-9]{6}$'),
  product_id text references fund_products(product_id),
  fund_name text not null,
  fund_type text,
  share_class text,
  established_date date,
  first_seen_date date not null,
  last_seen_date date not null,
  is_active boolean not null default true,
  grouping_confidence text,
  grouping_rule text,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists fund_shares_product_id_idx
  on fund_shares (product_id);
create index if not exists fund_shares_type_active_idx
  on fund_shares (fund_type, is_active);
create index if not exists fund_shares_name_idx
  on fund_shares (fund_name);

create table if not exists fund_share_daily_observations (
  fund_code text not null references fund_shares(fund_code),
  data_date date not null,
  net_value numeric(20, 8),
  daily_change_percent numeric(14, 6),
  scale_yi numeric(20, 6),
  total_shares_yi numeric(20, 6),
  scale_date date,
  shares_date date,
  purchase_status text,
  redemption_status text,
  operation_status text,
  scale_status text,
  scale_quality text,
  scale_source text,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  snapshot_id bigint references data_snapshots(id),
  raw_attributes jsonb not null default '{}'::jsonb,
  primary key (fund_code, data_date)
);

create index if not exists fund_share_observations_date_code_idx
  on fund_share_daily_observations (data_date desc, fund_code);
create index if not exists fund_share_observations_snapshot_id_idx
  on fund_share_daily_observations (snapshot_id);

create table if not exists fund_product_daily_metrics (
  product_id text not null references fund_products(product_id),
  data_date date not null,
  representative_fund_code text references fund_shares(fund_code),
  share_count integer,
  current_scale_yi numeric(20, 6),
  baseline_scale_yi numeric(20, 6),
  baseline_scale_date date,
  scale_net_increase_yi numeric(20, 6),
  scale_growth_percent numeric(14, 6),
  representative_nav numeric(20, 8),
  nav_growth_percent numeric(14, 6),
  max_drawdown_percent numeric(14, 6),
  drawdown_start_date date,
  drawdown_end_date date,
  metrics_coverage_start date,
  metrics_version text not null,
  source_updated_at timestamptz,
  calculated_at timestamptz not null default now(),
  snapshot_id bigint references data_snapshots(id),
  raw_attributes jsonb not null default '{}'::jsonb,
  primary key (product_id, data_date, metrics_version)
);

create index if not exists fund_product_metrics_date_idx
  on fund_product_daily_metrics (data_date desc, product_id);
create index if not exists fund_product_metrics_snapshot_id_idx
  on fund_product_daily_metrics (snapshot_id);

create table if not exists research_themes (
  theme_id text primary key,
  theme_name text,
  query_text text,
  board_code text,
  first_seen_date date not null,
  last_seen_date date not null,
  is_active boolean not null default true,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists theme_daily_signals (
  theme_id text not null references research_themes(theme_id),
  data_date date not null,
  methodology_version text not null,
  attention_score numeric(14, 6),
  validation_score numeric(14, 6),
  capacity_score numeric(14, 6),
  composite_score numeric(14, 6),
  rank integer,
  lifecycle_state text,
  evidence jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  snapshot_id bigint references data_snapshots(id),
  primary key (theme_id, data_date, methodology_version)
);

create index if not exists theme_daily_signals_date_rank_idx
  on theme_daily_signals (data_date desc, rank);
create index if not exists theme_daily_signals_snapshot_id_idx
  on theme_daily_signals (snapshot_id);

create table if not exists theme_attention_daily (
  theme_id text not null references research_themes(theme_id),
  data_date date not null,
  appearances integer,
  resonance integer,
  best_rank integer,
  sample_count integer,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  snapshot_id bigint references data_snapshots(id),
  primary key (theme_id, data_date)
);

create index if not exists theme_attention_daily_date_idx
  on theme_attention_daily (data_date desc, theme_id);
create index if not exists theme_attention_daily_snapshot_id_idx
  on theme_attention_daily (snapshot_id);

create table if not exists strategy_definitions (
  id bigint generated always as identity primary key,
  strategy_key text not null,
  version text not null,
  name text not null,
  description text,
  parameters jsonb not null default '{}'::jsonb,
  source_code_hash text,
  created_at timestamptz not null default now(),
  unique (strategy_key, version)
);

create table if not exists strategy_runs (
  id bigint generated always as identity primary key,
  strategy_definition_id bigint not null references strategy_definitions(id),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  start_date date not null,
  end_date date not null,
  data_cutoff timestamptz not null,
  benchmark text,
  assumptions jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error_summary text
);

create index if not exists strategy_runs_definition_id_idx
  on strategy_runs (strategy_definition_id, started_at desc);

create table if not exists strategy_daily_results (
  strategy_run_id bigint not null references strategy_runs(id) on delete cascade,
  data_date date not null,
  net_asset_value numeric(20, 8),
  daily_return numeric(14, 8),
  benchmark_return numeric(14, 8),
  drawdown numeric(14, 8),
  turnover numeric(14, 8),
  exposure numeric(14, 8),
  attributes jsonb not null default '{}'::jsonb,
  primary key (strategy_run_id, data_date)
);

create index if not exists strategy_daily_results_date_idx
  on strategy_daily_results (data_date, strategy_run_id);

create table if not exists strategy_positions (
  strategy_run_id bigint not null references strategy_runs(id) on delete cascade,
  data_date date not null,
  instrument_type text not null,
  instrument_id text not null,
  weight numeric(14, 8) not null,
  signal_value numeric(20, 8),
  entry_reason text,
  attributes jsonb not null default '{}'::jsonb,
  primary key (strategy_run_id, data_date, instrument_type, instrument_id)
);

create index if not exists strategy_positions_instrument_idx
  on strategy_positions (instrument_type, instrument_id, data_date desc);

commit;
