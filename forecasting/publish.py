from .scenarios import generate_theme_scenarios
THEMES=("gold","ai_semiconductor","dividend","bond","hong_kong_tech")
def build_scenario_publication(history,min_points=5):
    result=[]
    for theme in THEMES:
        rows=[]
        for snapshot in history:
            match=next((x for x in snapshot["scores"].get("themes",[]) if x["theme"]==theme),None)
            if match and match.get("score") is not None:rows.append({"date":snapshot["date"],"score":match["score"]})
        result.append(generate_theme_scenarios(theme,rows,min_points))
    return {"schemaVersion":1,"minimumHistoryPoints":min_points,"themes":result,"disclaimer":"历史不足时不生成概率；情景不是投资建议"}
