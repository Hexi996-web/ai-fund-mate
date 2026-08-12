from dataclasses import dataclass
from .domain import Theme
@dataclass(frozen=True)
class FundThemeLink:
    fund_code:str; theme:Theme; match_type:str; matched_rule:str; confidence:float; review_status:str
def link_funds(payload,rules,overrides):
    result=[]; seen=set(); overrides={(str(x["fund_code"]).zfill(6),x["theme"]):x for x in overrides}
    for fund in payload.get("funds",[]):
        code=str(fund.get("code","")).zfill(6); text=f'{fund.get("name","")} {fund.get("type","")}'.lower()
        for rule in rules:
            key=(code,rule["theme"]); override=overrides.get(key)
            if override and override["action"]=="exclude": continue
            matched=(not rule.get("required_any") or any(x.lower() in text for x in rule["required_any"])) and all(x.lower() in text for x in rule.get("required_all",[])) and not any(x.lower() in text for x in rule.get("excluded",[]))
            if override and override["action"]=="include": matched=True
            if matched and key not in seen:
                result.append(FundThemeLink(code,Theme(rule["theme"]),"override" if override else "rule",rule["id"],1 if override else .9,"reviewed" if override else "auto")); seen.add(key)
    return result
