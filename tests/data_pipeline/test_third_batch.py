import pandas as pd
from data_pipeline.third_batch import normalize_fx,normalize_southbound,policy_documents
def test_third_batch_preserves_units_and_official_policy_links():
    fx=pd.DataFrame([{"日期":"2026-08-12","央行中间价":678.82}])
    south=pd.DataFrame([{"交易日":"2026-08-12","资金方向":"南向","成交净买额":-13.6},{"交易日":"2026-08-12","资金方向":"南向","成交净买额":0.5}])
    assert normalize_fx(fx)[0]["value"]==6.7882
    assert normalize_southbound(south)[0]["value"]==-13.1
    docs=policy_documents()
    assert len(docs)>=5
    assert all(x["source_url"].startswith("https://") for x in docs)
