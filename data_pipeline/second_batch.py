import pandas as pd
def _date(v): return v.strftime("%Y-%m-%d") if hasattr(v,"strftime") else str(v)[:10]
def normalize_gold(df):
    r=df.sort_values("date").iloc[-1]; return [{"indicator_id":"gold_price_cny","date":_date(r["date"]),"value":float(r["close"]),"unit":"元/克","dimension":"Au99.99收盘","source_id":"akshare","upstream":"上海黄金交易所"}]
def normalize_repo(df):
    r=df.sort_values("date").iloc[-1]; return [{"indicator_id":"repo_rate","date":_date(r["date"]),"value":float(r["FR007"]),"unit":"%","dimension":"FR007","source_id":"akshare","upstream":"中国货币网公开数据"}]
def normalize_indices(zh,hk):
    red=zh[zh["代码"]=="sh000015"].iloc[0]; hr=hk.sort_values("date").iloc[-1]
    return [{"indicator_id":"dividend_index","date":pd.Timestamp.now().strftime("%Y-%m-%d"),"value":float(red["最新价"]),"unit":"点","dimension":"上证红利指数","source_id":"akshare","upstream":"新浪公开行情"},{"indicator_id":"hstech_index","date":_date(hr["date"]),"value":float(hr["close"]),"unit":"点","dimension":"恒生科技指数","source_id":"akshare","upstream":"新浪公开行情"}]
