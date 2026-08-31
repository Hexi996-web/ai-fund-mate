begin;

set local search_path = history, public;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'history_pipeline_writer') then
    create role history_pipeline_writer nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'history_api_reader') then
    create role history_api_reader nologin;
  end if;
end $$;

revoke all on pipeline_runs, data_snapshots, fund_products, fund_shares,
  fund_share_daily_observations, fund_product_daily_metrics, research_themes,
  theme_daily_signals, theme_attention_daily, strategy_definitions, strategy_runs,
  strategy_daily_results, strategy_positions from public;

grant usage on schema history to history_pipeline_writer, history_api_reader;
grant select, insert, update on pipeline_runs, data_snapshots, fund_products, fund_shares,
  fund_share_daily_observations, fund_product_daily_metrics, research_themes,
  theme_daily_signals, theme_attention_daily to history_pipeline_writer;
grant usage, select on all sequences in schema history to history_pipeline_writer;

grant select on pipeline_runs, data_snapshots, fund_products, fund_shares,
  fund_share_daily_observations, fund_product_daily_metrics, research_themes,
  theme_daily_signals, theme_attention_daily, latest_fund_share_observations,
  latest_fund_product_metrics, latest_theme_signals to history_api_reader;

commit;
