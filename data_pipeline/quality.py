from dataclasses import dataclass
from .domain import QualityStatus
@dataclass(frozen=True)
class QualityEvent:
    status: QualityStatus; severity: str; message: str; indicator_id: str|None=None
def evaluate_observation(observation,indicator,now):
    events=[]
    if (now-observation.collected_at).total_seconds()>indicator.stale_after_hours*3600:
        events.append(QualityEvent(QualityStatus.STALE,"warning","observation is stale",indicator.id))
    v=observation.numeric_value
    if v is None and not observation.text_value: events.append(QualityEvent(QualityStatus.MISSING,"error","value is missing",indicator.id))
    if v is not None and (("min" in indicator.validation and v<indicator.validation["min"]) or ("max" in indicator.validation and v>indicator.validation["max"])):
        events.append(QualityEvent(QualityStatus.CONFLICT,"error","value outside range",indicator.id))
    return events
