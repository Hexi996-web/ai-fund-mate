def generate_theme_scenarios(theme,history,min_points=5):
    ordered=sorted(history,key=lambda x:x["date"])
    if len(ordered)<min_points:return {"theme":theme,"status":"insufficient_history","requiredPoints":min_points,"availablePoints":len(ordered),"scenarios":[]}
    delta=ordered[-1]["score"]-ordered[0]["score"]
    if delta>5: probs=(.25,.55,.20)
    elif delta<-5: probs=(.55,.20,.25)
    else: probs=(.30,.30,.40)
    labels=("bearish","bullish","base")
    return {"theme":theme,"status":"ready","requiredPoints":min_points,"availablePoints":len(ordered),"feature":{"scoreDelta":round(delta,2)},"scenarios":[{"name":name,"probability":prob,"rule":"score-history direction; not an investment forecast"} for name,prob in zip(labels,probs)]}
