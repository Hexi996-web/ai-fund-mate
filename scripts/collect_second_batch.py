import json,sys
from datetime import date,timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
import akshare as ak
from data_pipeline.cli import _write
from data_pipeline.second_batch import normalize_gold,normalize_indices,normalize_repo
if __name__=="__main__":
    p=ROOT/"public/data/five-themes"; observations=json.loads((p/"observations.json").read_text(encoding="utf-8")); quality=json.loads((p/"quality.json").read_text(encoding="utf-8")); added=[]
    jobs=[("gold_price",lambda:normalize_gold(ak.spot_hist_sge(symbol="Au99.99"))),("repo",lambda:normalize_repo(ak.repo_rate_hist(start_date=str(date.today()-timedelta(days=14)),end_date=str(date.today())))),("indices",lambda:normalize_indices(ak.stock_zh_index_spot_sina(),ak.stock_hk_index_daily_sina(symbol="HSTECH")))]
    for name,job in jobs:
        try: added.extend(job()); quality.setdefault("sources",[]).append({"source":name,"status":"normal"})
        except Exception as exc: quality.setdefault("sources",[]).append({"source":name,"status":"source_unavailable","message":str(exc)[:300]})
    quality["sources"].extend([{"source":"social_financing","status":"source_unavailable","message":"upstream TLS handshake failure during verified smoke test"},{"source":"usd_cny","status":"parse_failed","message":"adapter returned unreadable column names; value not published"}])
    merged={(x["indicator_id"],x["date"],x.get("dimension","")):x for x in observations+added}; result=list(merged.values()); quality["observations"]=len(result); quality["status"]="normal" if result else "missing"
    _write(p/"observations.json",result); _write(p/"quality.json",quality); print(json.dumps({"added":len(added),"total":len(result)},ensure_ascii=False))
