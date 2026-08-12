import pandas as pd
from data_pipeline.second_batch import normalize_gold,normalize_repo,normalize_indices
def test_second_batch_normalizes_verified_frames():
    gold=pd.DataFrame([{"date":"2026-08-11","close":946.7}])
    repo=pd.DataFrame([{"date":"2026-08-11","FR007":1.5}])
    zh=pd.DataFrame([{"代码":"sh000015","名称":"红利指数","最新价":3208.9}])
    hk=pd.DataFrame([{"date":"2026-08-11","close":6234.5}])
    assert normalize_gold(gold)[0]["indicator_id"]=="gold_price_cny"
    assert normalize_repo(repo)[0]["value"]==1.5
    assert {x["indicator_id"] for x in normalize_indices(zh,hk)}=={"dividend_index","hstech_index"}
