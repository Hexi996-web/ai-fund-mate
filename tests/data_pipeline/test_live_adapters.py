import pandas as pd
from data_pipeline.live_adapters import normalize_yield, normalize_money, normalize_gold_reserve, normalize_etf_shares

def test_normalizes_verified_public_frames():
    y=pd.DataFrame([{"曲线名称":"中债国债收益率曲线","日期":"2026-08-11","10年":1.7161}])
    m=pd.DataFrame([{"月份":"2026年07月份","货币和准货币(M2)-同比增长":8.8,"货币(M1)-同比增长":5.6}])
    g=pd.DataFrame([{"月份":"2026年07月份","黄金储备-数值":3063.54}])
    e=pd.DataFrame([{"代码":"518880","名称":"华安黄金ETF","最新份额":100.0,"数据日期":"2026-08-12"},{"代码":"512480","名称":"半导体ETF","最新份额":200.0,"数据日期":"2026-08-12"}])
    assert normalize_yield(y)[0]["value"] == 1.7161
    assert len(normalize_money(m)) == 2
    assert normalize_gold_reserve(g)[0]["value"] == 3063.54
    assert {x["indicator_id"] for x in normalize_etf_shares(e)} == {"domestic_gold_etf_share","semiconductor_etf_share"}
