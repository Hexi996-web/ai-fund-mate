import hashlib,json,os
from datetime import date
from pathlib import Path
class ForecastLedger:
    def __init__(self,path):self.path=Path(path)
    def items(self):return json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else []
    def _write(self,items):
        self.path.parent.mkdir(parents=True,exist_ok=True);tmp=self.path.with_suffix(".tmp");tmp.write_text(json.dumps(items,ensure_ascii=False,sort_keys=True,separators=(",",":")),encoding="utf-8");os.replace(tmp,self.path)
    def record(self,payload):
        identity=f'{payload["theme"]}|{payload["createdAt"]}|{payload["dueAt"]}|{payload["snapshotSha256"]}'; fid=hashlib.sha256(identity.encode()).hexdigest()[:16]; items=self.items()
        existing=next((x for x in items if x["id"]==fid),None)
        if existing:return existing
        item={"id":fid,**payload,"review":None};items.append(item);self._write(items);return item
    def review(self,forecast_id,review_date,outcome):
        items=self.items();item=next(x for x in items if x["id"]==forecast_id)
        if date.fromisoformat(review_date)<date.fromisoformat(item["dueAt"]):return {"status":"not_due","dueAt":item["dueAt"]}
        if item["review"] is None:item["review"]={"status":"reviewed","reviewedAt":review_date,"outcome":outcome};self._write(items)
        return item["review"]
