import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
from data_pipeline.cli import _write
from data_pipeline.live_collect import collect_verified
if __name__=="__main__":
    observations,quality=collect_verified(); out=ROOT/"public/data/five-themes"
    _write(out/"observations.json",observations); _write(out/"quality.json",{"status":"normal" if observations else "missing","observations":len(observations),"sources":quality})
    print(json.dumps({"observations":len(observations),"quality":quality},ensure_ascii=False))
