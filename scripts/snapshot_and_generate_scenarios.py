import json,sys
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from data_pipeline.cli import _write
from forecasting.history import HistoryStore
from forecasting.publish import build_scenario_publication
if __name__=="__main__":
 p=ROOT/"public/data/five-themes"; load=lambda name:json.loads((p/name).read_text(encoding="utf-8")); today=date.today().isoformat(); payload={"observations":load("observations.json"),"quality":load("quality.json"),"scores":load("scores.json")}
 store=HistoryStore(ROOT/"public/data/five-themes/history");entry=store.save(today,payload);history=[]
 for item in store.index():
  snap=json.loads((ROOT/"public/data/five-themes/history"/item["path"]).read_text(encoding="utf-8"));history.append({"date":item["date"],"scores":snap["scores"]})
 result=build_scenario_publication(history,5);result["latestSnapshot"]=entry;_write(p/"scenarios.json",result);_write(p/"forecast-reviews.json",[]);print(json.dumps({"historyPoints":len(history),"statuses":[x["status"] for x in result["themes"]]},ensure_ascii=False))
