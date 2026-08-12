from datetime import date,datetime,timezone
from ..domain import Observation,QualityStatus
def _number(value):
    if value in (None,"","--","---"): return None
    try:return float(str(value).replace(",","").replace("%",""))
    except ValueError:return None
def parse_rows(rows,*,indicator_id,source_id,source_name,source_url,unit,snapshot_sha):
    out=[]
    for row in rows:
        d=date.fromisoformat(str(row["date"])[:10]); value=_number(row.get("value"))
        out.append(Observation(indicator_id,source_id,d,datetime.now(timezone.utc),value,None,unit,str(row.get("dimension","")),QualityStatus.NORMAL if value is not None else QualityStatus.MISSING,source_name,source_url,None,snapshot_sha,False))
    return out
