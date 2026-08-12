from dataclasses import asdict
from .domain import Theme
def _convert(x):
    if hasattr(x,"value"): return x.value
    if hasattr(x,"isoformat"): return x.isoformat()
    return x
def build_publication(observations,documents,fund_links,generated_at):
    names={"gold":"黄金","ai_semiconductor":"AI与半导体","dividend":"红利","bond":"债券","hong_kong_tech":"港股科技"}
    pack=lambda items:[{k:_convert(v) for k,v in asdict(x).items()} if hasattr(x,"__dataclass_fields__") else x for x in items]
    return {"manifest":{"schemaVersion":1,"generatedAt":generated_at,"themeCount":5},"themes":[{"id":t.value,"name":names[t.value]} for t in Theme],"observations":pack(observations),"documents":pack(documents),"fundLinks":pack(fund_links)}
