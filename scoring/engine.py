from .config import WEIGHTS
def _status(score,count):
    if count<3:return "insufficient_data"
    if score>=80:return "priority_research"
    if score>=65:return "active_watch"
    if score>=50:return "neutral_tracking"
    if score>=35:return "cautious"
    return "risk_or_unverified"
def aggregate_score(scores):
    available={k:v for k,v in scores.items() if v is not None}; weight=sum(WEIGHTS[k] for k in available)
    score=round(sum(v*WEIGHTS[k] for k,v in available.items())/weight,1) if weight else None
    return {"score":score,"availableEvidenceCount":len(available),"availableWeight":weight,"status":_status(score or 0,len(available))}
