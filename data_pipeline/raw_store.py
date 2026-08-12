import hashlib, json, os, re
from pathlib import Path
from .domain import RawSnapshot

_EXT = {"application/json":"json", "text/html":"html", "text/csv":"csv", "text/plain":"txt", "application/xml":"xml"}

class RawSnapshotStore:
    def __init__(self, root): self.root = Path(root).resolve()
    def save(self, source_id, collected_at, content, content_type):
        if not re.fullmatch(r"[a-z0-9_]+", source_id): raise ValueError("invalid source_id")
        digest = hashlib.sha256(content).hexdigest(); ext = _EXT.get(content_type, "bin")
        folder = self.root / source_id / f"{collected_at.year:04d}" / f"{collected_at.month:02d}"
        folder.mkdir(parents=True, exist_ok=True); path = folder / f"{digest}.{ext}"
        if not path.exists():
            tmp = path.with_suffix(path.suffix + ".tmp"); tmp.write_bytes(content); os.replace(tmp, path)
            meta = {"source_id":source_id,"collected_at":collected_at.isoformat(),"sha256":digest,"content_type":content_type}
            path.with_suffix(path.suffix + ".json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        return RawSnapshot(source_id, collected_at, digest, content_type, path)
