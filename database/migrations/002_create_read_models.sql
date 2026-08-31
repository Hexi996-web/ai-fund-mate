begin;

create or replace view latest_fund_share_observations as
select distinct on (observation.fund_code)
  observation.*
from fund_share_daily_observations observation
order by observation.fund_code, observation.data_date desc, observation.ingested_at desc;

create or replace view latest_fund_product_metrics as
select distinct on (metric.product_id)
  metric.*
from fund_product_daily_metrics metric
order by metric.product_id, metric.data_date desc, metric.calculated_at desc;

create or replace view latest_theme_signals as
select distinct on (signal.theme_id)
  signal.*
from theme_daily_signals signal
order by signal.theme_id, signal.data_date desc, signal.ingested_at desc;

commit;
