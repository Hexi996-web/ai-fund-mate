import hashlib,json,os
from pathlib import Path
class HistoryStore:
    def __init__(self,root):self.root=Path(root)
    def save(self,snapshot_date,payload):
        body=json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(",",":" )).encode(); digest=hashlib.sha256(body).hexdigest(); folder=self.root/snapshot_date; folder.mkdir(parents=True,exist_ok=True); path=folder/f"{digest}.json"
        if not path.exists():
            tmp=path.with_suffix(".tmp");tmp.write_bytes(body);os.replace(tmp,path)
        index=self.index(); entry={"date":snapshot_date,"sha256":digest,"path":str(path.relative_to(self.root)).replace('\\','/')}
        if not any(x["date"]==snapshot_date and x["sha256"]==digest for x in index):
            index.append(entry);(self.root/"index.json").write_text(json.dumps(sorted(index,key=lambda x:(x["date"],x["sha256"])),ensure_ascii=False),encoding="utf-8")
        return entry
    def index(self):
        path=self.root/"index.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
