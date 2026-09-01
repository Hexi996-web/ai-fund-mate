begin;

set local search_path = history, public;

create table if not exists industry_demand_observations (
  source_id text not null,
  theme_id text not null,
  metric_name text not null,
  metric_role text not null,
  data_period text not null,
  cadence text not null check (cadence in ('monthly', 'quarterly', 'annual')),
  value numeric,
  unit text,
  yoy_percent numeric,
  base_weight_percent numeric not null,
  source_name text not null,
  source_url text,
  published_at timestamptz,
  collected_at timestamptz not null,
  snapshot_id bigint references data_snapshots(id),
  ingested_at timestamptz not null default now(),
  primary key (source_id, data_period)
);

create index if not exists industry_demand_observations_theme_period_idx
  on industry_demand_observations (theme_id, data_period desc);

revoke all on industry_demand_observations from public;
grant select, insert, update on industry_demand_observations to history_pipeline_writer;
grant select on industry_demand_observations to history_api_reader;

commit;
