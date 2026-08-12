from dataclasses import dataclass
from ..domain import QualityStatus

@dataclass
class CollectorResult:
    records: list; events: list; quality_status: QualityStatus
@dataclass
class RunSummary:
    results: dict
class CollectorRegistry:
    def __init__(self): self.factories={}
    def register(self, source_id, factory): self.factories[source_id]=factory
    def create(self, source_id): return self.factories[source_id]()
def run_collectors(source_ids, registry, context):
    results={}
    for sid in source_ids:
        try:
            c=registry.create(sid); raw=c.fetch(context); records=c.normalize(raw,context)
            results[sid]=CollectorResult(records,c.validate(records,context),QualityStatus.NORMAL)
        except Exception as exc:
            status=QualityStatus.SOURCE_UNAVAILABLE if isinstance(exc,(TimeoutError,ConnectionError)) else QualityStatus.PARSE_FAILED
            results[sid]=CollectorResult([],[{"message":str(exc)}],status)
    return RunSummary(results)
