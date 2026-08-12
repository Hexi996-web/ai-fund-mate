import re
import pandas as pd

def _date(value):
    if hasattr(value,"strftime"): return value.strftime("%Y-%m-%d")
    text=str(value); m=re.search(r"(\d{4})年(\d{2})月",text)
    return f"{m.group(1)}-{m.group(2)}-01" if m else text[:10]
def normalize_yield(frame):
    row=frame[frame["曲线名称"]=="中债国债收益率曲线"].sort_values("日期").iloc[-1]
    return [{"indicator_id":"cn_yield_curve","date":_date(row["日期"]),"value":float(row["10年"]),"unit":"%","dimension":"10年","source_id":"akshare","upstream":"中国债券信息网"},{"indicator_id":"cn_govt_yield_10y_dividend","date":_date(row["日期"]),"value":float(row["10年"]),"unit":"%","dimension":"10年","source_id":"akshare","upstream":"中国债券信息网"}]
def normalize_money(frame):
    row=frame.iloc[0]
    return [{"indicator_id":"m1_m2","date":_date(row["月份"]),"value":float(row[col]),"unit":"%","dimension":dim,"source_id":"akshare","upstream":"中国人民银行"} for col,dim in (("货币(M1)-同比增长","M1同比"),("货币和准货币(M2)-同比增长","M2同比"))]
def normalize_gold_reserve(frame):
    row=frame.sort_values("月份").iloc[-1]
    return [{"indicator_id":"central_bank_gold","date":_date(row["月份"]),"value":float(row["黄金储备-数值"]),"unit":"万盎司","dimension":"","source_id":"akshare","upstream":"中国人民银行"}]
_THEMES={"domestic_gold_etf_share":["黄金ETF"],"semiconductor_etf_share":["半导体","芯片"],"dividend_etf_share":["红利","高股息"],"bond_etf_share":["债ETF","债券ETF","国债ETF","信用债"],"hstech_etf_share":["恒生科技","港股科技","港股互联网"]}
def normalize_etf_shares(frame):
    out=[]
    for indicator,terms in _THEMES.items():
        subset=frame[frame["名称"].astype(str).map(lambda x:any(t in x for t in terms))]
        if subset.empty: continue
        out.append({"indicator_id":indicator,"date":_date(subset["数据日期"].max()),"value":float(pd.to_numeric(subset["最新份额"],errors="coerce").fillna(0).sum()),"unit":"份","dimension":"合计","source_id":"akshare","upstream":"东方财富公开行情"})
    return out
