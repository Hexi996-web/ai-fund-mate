from collections import Counter
from datetime import date,datetime,timezone
from .config import VERSION,WEIGHTS
from .confidence import calculate_confidence
from .engine import aggregate_score
from .rules import level_score,policy_score,product_supply_score
THEMES={
 "gold":{"funds":["domestic_gold_etf_share"],"fundamental":["gold_price_cny","central_bank_gold"],"valuation":["usd_cny_gold","us_real_yield_10y"]},
 "ai_semiconductor":{"funds":["semiconductor_etf_share"],"fundamental":["integrated_circuit_output","semiconductor_sales"],"valuation":["semiconductor_index"]},
 "dividend":{"funds":["dividend_etf_share"],"fundamental":[],"valuation":["dividend_index","dividend_yield","cn_govt_yield_10y_dividend"]},
 "bond":{"funds":["repo_rate"],"fundamental":["m1_m2","social_financing"],"valuation":["cn_yield_curve"]},
 "hong_kong_tech":{"funds":["southbound_turnover","hstech_etf_share"],"fundamental":["usd_cny_hk"],"valuation":["hstech_index","hstech_valuation"]},
}
def generate_scores(observations,documents,fund_links,quality,generated_at=None):
 counts=Counter(x.get("theme") for x in fund_links); coverage=quality.get("coverage",{}); themes=[]
 for theme,mapping in THEMES.items():
  evidence={"policy":policy_score([x for x in documents if x.get("theme")==theme]),"funds":level_score(observations,mapping["funds"]),"fundamental":level_score(observations,mapping["fundamental"]),"valuation":level_score(observations,mapping["valuation"]),"product_supply":product_supply_score(counts[theme])}
  scores={k:v["score"] for k,v in evidence.items()}; aggregate=aggregate_score(scores); available=aggregate["availableEvidenceCount"]
  theme_indicators=sum(mapping.values(),[]); normal=sum(coverage.get(x)=="normal" for x in theme_indicators); total=max(1,len(theme_indicators))
  source_rel=.7 if normal else .3; consistency=.5 if available>=3 else .25
  dates=[date.fromisoformat(x["date"]) for x in observations if x.get("indicator_id") in theme_indicators]
  timely=sum((date.today()-d).days<=45 for d in dates)/len(dates) if dates else 0
  confidence=calculate_confidence(normal,total,source_rel,consistency,timely)
  reasons=[f"{x}={coverage.get(x,'missing')}" for x in theme_indicators if coverage.get(x)!="normal"]
  themes.append({"theme":theme,**aggregate,"confidence":confidence,"evidence":evidence,"degradedReasons":reasons,"weights":WEIGHTS,"disclaimer":"研究机会试算，不构成投资建议或产品立项结论"})
 return {"schemaVersion":1,"scoringVersion":VERSION,"generatedAt":generated_at or datetime.now(timezone.utc).isoformat(),"themes":themes}
