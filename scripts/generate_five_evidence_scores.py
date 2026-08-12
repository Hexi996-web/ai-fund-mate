import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from data_pipeline.cli import _write
from scoring.generate import generate_scores
if __name__=="__main__":
 p=ROOT/"public/data/five-themes"; load=lambda name:json.loads((p/name).read_text(encoding="utf-8"))
 result=generate_scores(load("observations.json"),load("documents.json"),load("fund-links.json"),load("quality.json"));_write(p/"scores.json",result)
 print(json.dumps([{"theme":x["theme"],"score":x["score"],"status":x["status"],"confidence":x["confidence"]["score"]} for x in result["themes"]],ensure_ascii=False))
