begin;

set local search_path = history, public;

create table if not exists attention_raw_samples (
  captured_at timestamptz primary key,
  sources jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  ingested_at timestamptz not null default now()
);

create index if not exists attention_raw_samples_captured_at_idx
  on attention_raw_samples (captured_at desc);

grant select, insert, update on attention_raw_samples to history_pipeline_writer;
grant select on attention_raw_samples to history_api_reader;

commit;
