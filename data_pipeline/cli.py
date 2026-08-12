import argparse,json
from pathlib import Path
from .catalog import load_indicator_catalog,load_source_catalog
from .fund_theme import link_funds
from .publish import build_publication
def _write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True); tmp=path.with_suffix(path.suffix+".tmp")
    tmp.write_text(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(",",":")),encoding="utf-8"); tmp.replace(path)
def main(argv=None):
    p=argparse.ArgumentParser(); sub=p.add_subparsers(dest="command",required=True)
    for name in ("catalog-check","link-funds","publish","run-daily"):
        q=sub.add_parser(name); q.add_argument("--root",default=".")
    args=p.parse_args(argv); root=Path(args.root)
    sources=load_source_catalog(root/"config/five_theme_sources.json"); indicators=load_indicator_catalog(root/"config/five_theme_indicators.json",sources)
    if args.command=="catalog-check": return 0
    rules=json.loads((root/"config/fund_theme_rules.json").read_text(encoding="utf-8")); overrides=json.loads((root/"config/fund_theme_overrides.json").read_text(encoding="utf-8"))
    funds=json.loads((root/"public/funds_active.json").read_text(encoding="utf-8")); links=link_funds(funds,rules,overrides)
    publication=build_publication([],[],links,"fixture-or-runtime")
    out=root/"public/data/five-themes"
    _write(out/"manifest.json",publication["manifest"]); _write(out/"themes.json",publication["themes"]); _write(out/"fund-links.json",publication["fundLinks"])
    _write(out/"observations.json",[]); _write(out/"documents.json",[]); _write(out/"quality.json",{"configuredIndicators":len(indicators),"status":"missing"})
    return 0
if __name__=="__main__": raise SystemExit(main())
