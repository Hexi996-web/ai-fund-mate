import json,sys
from datetime import date,timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
import akshare as ak
from data_pipeline.cli import _write
from data_pipeline.third_batch import normalize_fx,normalize_southbound,policy_documents
if __name__=="__main__":
 p=ROOT/"public/data/five-themes"; observations=json.loads((p/"observations.json").read_text(encoding="utf-8")); quality=json.loads((p/"quality.json").read_text(encoding="utf-8")); added=[]
 jobs=[("usd_cny",lambda:normalize_fx(ak.currency_boc_sina(symbol="美元",start_date=(date.today()-timedelta(days=14)).strftime("%Y%m%d"),end_date=date.today().strftime("%Y%m%d")))),("southbound",lambda:normalize_southbound(ak.stock_hsgt_fund_flow_summary_em()))]
 for name,job in jobs:
  try: added.extend(job()); quality.setdefault("sources",[]).append({"source":name,"status":"normal"})
  except Exception as exc: quality.setdefault("sources",[]).append({"source":name,"status":"source_unavailable","message":str(exc)[:300]})
 quality["sources"].extend([{"source":"hstech_valuation","status":"source_unavailable","message":"public adapter returned no chart payload"},{"source":"dividend_valuation","status":"source_unavailable","message":"public index valuation endpoint TLS EOF"},{"source":"integrated_circuit_output","status":"parse_failed","message":"NBS internal catalog path requires verified configuration"}])
 merged={(x["indicator_id"],x["date"],x.get("dimension","")):x for x in observations+added}; result=list(merged.values()); quality["observations"]=len(result)
 _write(p/"observations.json",result); _write(p/"documents.json",policy_documents()); _write(p/"quality.json",quality); print(json.dumps({"added":len(added),"documents":len(policy_documents()),"total":len(result)},ensure_ascii=False))
