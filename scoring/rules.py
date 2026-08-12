def policy_score(documents):
    valid=[x for x in documents if x.get("quality_status") in {"normal","human_confirmed"}]
    if not valid:return {"score":None,"rule":"no valid policy document","evidence":[]}
    official=sum(x.get("source_name") in {"中国证监会","中国政府网","中国人民银行","上海黄金交易所"} for x in valid)
    score=min(80,60+5*official)
    return {"score":score,"rule":"valid official policy metadata; no directional inference","evidence":[x.get("title") for x in valid]}
def product_supply_score(link_count):
    if link_count<=0:return {"score":None,"rule":"no verified product links","evidence":[]}
    if link_count<50:score=80
    elif link_count<250:score=65
    elif link_count<1000:score=45
    else:score=25
    return {"score":score,"rule":"inverse fund-share crowding bands: <50, <250, <1000, >=1000","evidence":[f"linkedFundShares={link_count}"]}
def level_score(observations,indicator_ids):
    found=[x for x in observations if x.get("indicator_id") in indicator_ids]
    if not found:return {"score":None,"rule":"no current observation","evidence":[]}
    return {"score":50,"rule":"single snapshot confirms availability only; trend unavailable","evidence":[f"{x['indicator_id']}={x['value']} {x['unit']} ({x['date']})" for x in found]}
