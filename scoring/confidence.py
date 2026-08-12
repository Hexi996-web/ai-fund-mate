from .config import CONFIDENCE_WEIGHTS
def calculate_confidence(available,total,source_reliability,consistency,timeliness):
    completeness=available/total if total else 0
    components={"completeness":round(completeness*100,1),"sourceReliability":round(source_reliability*100,1),"consistency":round(consistency*100,1),"timeliness":round(timeliness*100,1)}
    score=round(sum(components[k]*CONFIDENCE_WEIGHTS[k] for k in components)/100,1)
    return {"score":score,"components":components}
