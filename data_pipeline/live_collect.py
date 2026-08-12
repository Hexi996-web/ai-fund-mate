from datetime import date,datetime,timedelta,timezone
import akshare as ak
from .live_adapters import normalize_etf_shares,normalize_gold_reserve,normalize_money,normalize_yield
def collect_verified():
    today=date.today(); start=(today-timedelta(days=14)).strftime("%Y%m%d"); end=today.strftime("%Y%m%d")
    observations=[]; quality=[]
    jobs=[("yield",lambda:normalize_yield(ak.bond_china_yield(start_date=start,end_date=end))),("money",lambda:normalize_money(ak.macro_china_money_supply())),("gold_reserve",lambda:normalize_gold_reserve(ak.macro_china_fx_gold())),("etf",lambda:normalize_etf_shares(ak.fund_etf_spot_em()))]
    for name,job in jobs:
        try: observations.extend(job()); quality.append({"source":name,"status":"normal"})
        except Exception as exc: quality.append({"source":name,"status":"source_unavailable","message":str(exc)[:300]})
    return observations,quality
