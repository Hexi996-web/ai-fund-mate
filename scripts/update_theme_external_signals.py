"""Update long-horizon public attention and ETF demand signals for all 36 themes."""
from __future__ import annotations

import json
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from scripts.update_attention_pool import THEMES, THEME_TERMS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "theme_external_signals.json"
WIKI_API = "https://zh.wikipedia.org/w/api.php"
PAGEVIEWS = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/zh.wikipedia.org/all-access/user/{title}/daily/{start}/{end}"
HEADERS = {"User-Agent": "AI-Fund-Mate/1.0 (public research dashboard)"}
WIKI_TITLES = {
    "ai-agent": "人工智能", "embodied-ai": "人形机器人", "space": "商业航天", "power": "智能电网",
    "hard-tech": "半导体", "biotech": "新药研发", "longevity": "银发经济", "experience": "体验经济",
    "resources": "关键矿产", "future-tech": "量子技术", "industrial-software": "工业软件", "ai-application": "生成式人工智能",
    "cybersecurity": "数据安全", "smart-healthcare": "智慧医疗", "synthetic-biology": "合成生物学", "nuclear-energy": "可控核聚变",
    "water-security": "水资源", "low-altitude": "低空经济", "autonomous-driving": "自动驾驶汽车", "obesity-care": "肥胖症",
    "climate-adaptation": "适应气候变化", "digital-health": "数字健康", "mental-health": "心理健康", "pet-economy": "宠物",
    "sports-outdoor": "户外运动", "inbound-consumption": "中国旅游业", "new-food": "功能性食品", "recycling": "循环经济",
    "grid-storage": "储能", "defense-tech": "无人作战载具", "agri-tech": "农业技术", "wealth-longevity": "养老金",
    "human-upskilling": "职业教育", "creator-economy": "创作者经济", "ocean-economy": "海洋经济", "service-robot": "服务机器人",
}
WIKI_RELATED = {
    "biotech": ["药物发现", "生物技术", "制药产业"],
    "experience": ["旅游", "文化产业", "消费者行为"],
    "resources": ["稀土元素", "采矿业", "矿产资源"],
    "industrial-software": ["计算机辅助设计", "企业资源计划", "工业控制系统"],
    "new-food": ["膳食補充品", "营养强化", "保健食品"],
    "defense-tech": ["无人机作战", "无人系统部队", "军用机器人"],
    "ocean-economy": ["海洋工程", "海洋资源", "渔业"],
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)
SESSION.mount("https://", HTTPAdapter(max_retries=Retry(total=4, backoff_factor=1, status_forcelist=(429, 500, 502, 503, 504))))


def load_previous() -> dict:
    if not OUT.exists():
        return {"items": []}
    return json.loads(OUT.read_text(encoding="utf-8"))


def pageviews_for_title(title: str, start: date, end: date) -> list[dict]:
    url = PAGEVIEWS.format(title=quote(title.replace(" ", "_"), safe=""), start=start.strftime("%Y%m%d"), end=end.strftime("%Y%m%d"))
    response = SESSION.get(url, timeout=30)
    if response.status_code == 404:
        return []
    response.raise_for_status()
    daily = [{"date": row["timestamp"][:8], "views": row["views"]} for row in response.json().get("items", [])]
    return [{"date": f"{row['date'][:4]}-{row['date'][4:6]}-{row['date'][6:]}", "views": row["views"]} for row in daily]


def wiki_pageviews(theme_id: str, start: date, end: date) -> dict:
    candidates = WIKI_RELATED.get(theme_id) or [WIKI_TITLES[theme_id], *THEME_TERMS[theme_id]]
    candidates = list(dict.fromkeys(candidates))[:3]
    totals: dict[str, int] = {}
    matched = []
    for title in candidates:
        rows = pageviews_for_title(title, start, end)
        if rows:
            matched.append(title)
            for row in rows:
                totals[row["date"]] = totals.get(row["date"], 0) + row["views"]
        time.sleep(.3)
    daily = [{"date": day, "views": totals[day]} for day in sorted(totals)]
    return {"status": "真实公开数据" if daily else "相关词条均无数据", "titles": matched, "candidateTitles": candidates, "daily": daily, "source": "Wikimedia Analytics API（主题词条篮子）"}


def build_payload(today: date | None = None) -> dict:
    today = today or date.today()
    start = today - timedelta(days=365)
    previous = {item["id"]: item for item in load_previous().get("items", [])}
    items = []
    for theme_id, query, _ in THEMES:
        old = previous.get(theme_id, {})
        try:
            wiki = wiki_pageviews(theme_id, start, today)
        except Exception as exc:
            wiki = old.get("wikimedia") or {"status": f"获取失败：{type(exc).__name__}", "daily": []}
        items.append({"id": theme_id, "wikimedia": wiki})
    return {"schemaVersion": 2, "generatedAt": today.isoformat(), "universeCount": len(THEMES), "wikimediaBackfillDays": 365, "method": "每个主题使用最多3个预先审定的相关词条汇总，所有主题使用同一口径。", "items": items}


def main() -> None:
    payload = build_payload()
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    wiki_covered = sum(bool(item["wikimedia"].get("daily")) for item in payload["items"])
    print(f"wrote {OUT}: wikimedia={wiki_covered}/36")


if __name__ == "__main__":
    main()
