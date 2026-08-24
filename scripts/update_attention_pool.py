"""Build the public-data snapshot for the social-attention foresight map.

The two axes intentionally use observable proxies:
- social attention: Eastmoney public-news search, recent publication density;
- product-market validation: comparable fund scale growth and new launches.

Neither proxy is labelled as enterprise revenue or a customer survey.  Themes
without both series remain in the research universe but receive no coordinates.
"""
from __future__ import annotations

import json
import math
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import fmean

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "attention_pool_evidence.json"
PRE_EVIDENCE = ROOT / "public" / "pre_research_evidence.json"
FUND_PRODUCTS = ROOT / "public" / "fund_products.json"

THEMES = [
    ("ai-agent", "人工智能", "BK0800"),
    ("embodied-ai", "人形机器人", "BK1184"),
    ("space", "商业航天", "BK0963"),
    ("power", "智能电网", "BK1647"),
    ("hard-tech", "半导体设备", "BK0917"),
    ("biotech", "创新药", "BK1106"),
    ("longevity", "养老产业", "BK0653"),
    ("experience", "文旅消费", "BK1652"),
    ("resources", "战略资源", "BK0523"),
    ("future-tech", "量子科技", "BK0710"),
    ("industrial-software", "工业软件", "BK0696"),
    ("ai-application", "人工智能应用", "BK0579"),
    ("cybersecurity", "数据安全", "BK1047"),
    ("smart-healthcare", "医疗服务", "BK0727"),
    ("synthetic-biology", "合成生物", "BK1174"),
    ("nuclear-energy", "核能核电", "BK0577"),
    ("water-security", "水利建设", "BK0597"),
    ("low-altitude", "低空经济", "BK1166"),
    ("autonomous-driving", "车联网", "BK0920"),
    ("obesity-care", "减肥药", "BK1146"),
    ("climate-adaptation", "气候适应", "BK1058"),
    ("digital-health", "数字健康", "BK0727"),
    ("mental-health", "精神健康", "BK0727"),
    ("pet-economy", "宠物经济", "BK0993"),
    ("sports-outdoor", "户外运动", "BK0708"),
    ("inbound-consumption", "入境消费", "BK0485"),
    ("new-food", "功能营养", "BK1579"),
    ("recycling", "循环经济", "BK0873"),
    ("grid-storage", "长时储能", "BK1003"),
    ("defense-tech", "无人系统", "BK0490"),
    ("agri-tech", "农业科技", "BK0888"),
    ("wealth-longevity", "养老金融", "BK0474"),
    ("human-upskilling", "职业再训练", "BK0740"),
    ("creator-economy", "AI内容创作", "BK0486"),
    ("ocean-economy", "海洋经济", "BK1230"),
    ("service-robot", "服务机器人", "BK1090"),
]

FUND_KEYWORDS = {
    "ai-agent": ["人工智能", "AI", "算力", "云计算", "大数据"],
    "embodied-ai": ["机器人", "智能制造", "自动化"], "space": ["航天", "卫星", "军工"],
    "power": ["电力", "电网", "储能", "新能源"], "hard-tech": ["半导体", "芯片", "工业母机", "自主可控"],
    "biotech": ["创新药", "生物医药", "医药"], "longevity": ["养老", "银发", "医疗服务", "健康"],
    "experience": ["旅游", "消费", "文娱", "传媒"], "resources": ["有色", "稀土", "新材料", "资源", "矿业"],
    "future-tech": ["量子", "6G", "脑机", "核聚变"], "industrial-software": ["工业软件", "软件", "工业互联网"],
    "ai-application": ["软件", "云计算", "互联网", "人工智能"],
    "cybersecurity": ["网络安全", "数据安全", "信息安全"],
    "smart-healthcare": ["医疗服务", "智慧医疗", "互联网医疗"],
    "synthetic-biology": ["合成生物", "生物制造"],
    "nuclear-energy": ["核电", "核能"],
    "water-security": ["水务", "水利", "节水"],
    "low-altitude": ["低空经济", "航空装备", "无人机"],
    "autonomous-driving": ["智能驾驶", "自动驾驶", "车联网"],
    "obesity-care": ["减肥药", "体重管理", "代谢"],
    "climate-adaptation": ["气候", "水利", "地下管网", "韧性城市"],
    "digital-health": ["数字医疗", "互联网医疗", "医疗服务"],
    "mental-health": ["精神健康", "心理健康", "医疗服务"],
    "pet-economy": ["宠物", "动物保健"],
    "sports-outdoor": ["体育", "户外", "运动"],
    "inbound-consumption": ["旅游", "酒店", "消费"],
    "new-food": ["食品", "营养", "保健品"],
    "recycling": ["循环经济", "再生资源", "环保"],
    "grid-storage": ["储能", "电力", "新能源"],
    "defense-tech": ["军工", "国防", "无人机"],
    "agri-tech": ["农业", "粮食", "种业"],
    "wealth-longevity": ["养老", "保险", "养老目标"],
    "human-upskilling": ["教育", "职业教育", "培训"],
    "creator-economy": ["传媒", "游戏", "互联网", "人工智能"],
    "ocean-economy": ["海洋", "船舶", "航运"],
    "service-robot": ["机器人", "家电", "智能家居"],
}

HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"}


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def get_json(url: str, params: dict, timeout: int = 40) -> dict:
    response = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def eastmoney_attention(query: str) -> dict:
    callback = "jQuery_attention"
    articles = []
    hits_total = None
    for page in range(1, 6):
        body = {
            "uid": "", "keyword": query, "type": ["cmsArticleWebOld"],
            "client": "web", "clientType": "web", "clientVersion": "curr",
            "param": {"cmsArticleWebOld": {"searchScope": "default", "sort": "default",
                      "pageIndex": page, "pageSize": 100, "preTag": "", "postTag": ""}},
        }
        response = requests.get(
            "https://search-api-web.eastmoney.com/search/jsonp",
            params={"cb": callback, "param": json.dumps(body, ensure_ascii=False, separators=(",", ":"))},
            headers={**HEADERS, "Referer": "https://so.eastmoney.com/"}, timeout=40,
        )
        response.raise_for_status()
        match = re.search(r"^[^(]+\((.*)\)\s*$", response.text, re.S)
        if not match:
            raise ValueError("Eastmoney news response was not valid JSONP")
        payload = json.loads(match.group(1))
        hits_total = payload.get("hitsTotal", hits_total)
        page_articles = payload.get("result", {}).get("cmsArticleWebOld") or []
        articles.extend(page_articles)
        if len(page_articles) < 100:
            break
        time.sleep(0.15)
    today = date.today()
    parsed = []
    for article in articles:
        try:
            parsed.append(datetime.strptime(article.get("date", "")[:10], "%Y-%m-%d").date())
        except ValueError:
            continue
    recent = sum(day >= today - timedelta(days=30) for day in parsed)
    prior = sum(today - timedelta(days=60) <= day < today - timedelta(days=30) for day in parsed)
    acceleration = (recent / max(prior, 1) - 1) * 100
    score = clamp(20 + math.log1p(recent) * 13 + clamp(acceleration, -50, 100) * 0.15)
    return {
        "score": round(score, 1),
        "recent30Articles": recent,
        "prior30Articles": prior,
        "accelerationPercent": round(acceleration, 1),
        "sampledArticles": len(parsed),
        "hitsTotal": hits_total,
        "source": "东方财富公开新闻搜索",
        "sourceUrl": "https://search-api-web.eastmoney.com/search/jsonp",
        "status": "真实公开代理",
        "note": "统计最近最多500条公开新闻搜索结果的近期文章密度；衡量媒体注意力，不等同居民搜索、客户调研或申购意愿。",
    }


def cninfo_total(query: str, start: date, end: date) -> int:
    for attempt in range(3):
        response = requests.post(
            "http://www.cninfo.com.cn/new/hisAnnouncement/query",
            data={"tabName": "fulltext", "pageSize": "30", "pageNum": "1", "column": "szse",
                  "category": "", "plate": "", "searchkey": query, "secid": "", "trade": "",
                  "seDate": f"{start.isoformat()}~{end.isoformat()}", "stock": "", "sortName": "",
                  "sortType": "", "isHLtitle": "true"},
            headers={**HEADERS, "X-Requested-With": "XMLHttpRequest"}, timeout=40,
        )
        response.raise_for_status()
        try:
            return int(response.json().get("totalAnnouncement") or 0)
        except ValueError:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
    return 0


def enterprise_validation(query: str) -> dict:
    today = date.today()
    recent = cninfo_total(query, today - timedelta(days=90), today)
    time.sleep(1.0)
    prior = cninfo_total(query, today - timedelta(days=180), today - timedelta(days=91))
    acceleration = (recent / max(prior, 1) - 1) * 100
    score = clamp(20 + math.log1p(recent) * 14 + clamp(acceleration, -50, 100) * 0.12)
    return {
        "score": round(score, 1),
        "recent90Announcements": recent,
        "prior90Announcements": prior,
        "accelerationPercent": round(acceleration, 1),
        "asOf": today.isoformat(),
        "source": "巨潮资讯全市场公告标题检索",
        "sourceUrl": "http://www.cninfo.com.cn/new/hisAnnouncement/query",
        "status": "真实公开代理",
        "note": "公告标题命中衡量上市公司披露活跃度；不替代公告正文中的订单、收入或利润核验。",
    }


def product_validation(theme_id: str) -> dict:
    payload = json.loads(FUND_PRODUCTS.read_text(encoding="utf-8"))
    products = payload.get("products") or []
    keywords = FUND_KEYWORDS[theme_id]
    peers = [item for item in products if any(word.lower() in (item.get("productName") or "").lower() for word in keywords)]
    comparable = [item for item in peers if item.get("baselineScaleType") == "2025年末披露规模"
                  and isinstance(item.get("baselineScaleYi"), (int, float)) and isinstance(item.get("currentScaleYi"), (int, float))]
    baseline = sum(item["baselineScaleYi"] for item in comparable)
    increase = sum(item.get("scaleNetIncreaseYi", item["currentScaleYi"] - item["baselineScaleYi"]) for item in comparable)
    growth = increase / baseline * 100 if baseline else 0
    total = sum(item.get("currentScaleYi") or 0 for item in peers)
    today = date.today()
    launched = 0
    for item in peers:
        try:
            established = datetime.strptime(item.get("establishedDate") or "", "%Y-%m-%d").date()
        except ValueError:
            continue
        launched += established >= today - timedelta(days=365)
    score = clamp(30 + clamp(growth, -40, 80) * 0.35 + math.log1p(total) * 4 + min(launched, 15) * 1.2)
    return {
        "score": round(score, 1), "peerFunds": len(peers), "comparableFunds": len(comparable),
        "currentScaleYi": round(total, 1), "scaleNetIncreaseYi": round(increase, 1),
        "scaleGrowthPercent": round(growth, 1), "launched12Months": launched,
        "asOf": payload.get("updateTime"), "source": "AI Fund Mate全市场公开基金快照",
        "sourceUrl": "/fund_products.json", "status": "真实公开数据",
        "note": "衡量同类基金的规模与新增供给，只代表产品市场验证，不替代产业收入、利润或订单。",
    }


def asset_capacity() -> dict[str, dict]:
    """Fetch current float market cap for every mapped Eastmoney concept board."""
    values = {}
    names = {}
    for theme_id, _query, board in THEMES:
        try:
            payload = get_json(
                "https://push2delay.eastmoney.com/api/qt/stock/get",
                {"secid": f"90.{board}", "fields": "f57,f58,f116,f117"},
            ).get("data") or {}
            float_cap = payload.get("f117")
            if isinstance(float_cap, (int, float)) and float_cap > 0:
                values[theme_id] = float_cap / 100_000_000
                names[theme_id] = payload.get("f58") or board
        except Exception:
            continue
        time.sleep(0.15)
    ordered = sorted(values.values())
    result = {}
    for theme_id, value in values.items():
        percentile = (ordered.index(value) + 1) / len(ordered)
        result[theme_id] = {
            "score": round(30 + percentile * 65, 1), "floatMarketCapYi": value,
            "boardName": names.get(theme_id), "asOf": date.today().isoformat(),
            "source": "东方财富公开板块行情", "sourceUrl": "https://push2delay.eastmoney.com/api/qt/stock/get",
            "status": "真实公开数据",
        }
    return result


def load_previous() -> dict:
    if not OUT.exists():
        return {}
    try:
        return {item["id"]: item for item in json.loads(OUT.read_text(encoding="utf-8")).get("items", [])}
    except (ValueError, OSError):
        return {}


def main() -> None:
    previous = load_previous()
    capacities = asset_capacity()
    items = []
    for index, (theme_id, query, board) in enumerate(THEMES):
        old = previous.get(theme_id, {})
        errors = []
        try:
            attention = eastmoney_attention(query)
        except Exception as exc:  # keep the last usable snapshot on transient failures
            attention = old.get("attention")
            errors.append(f"attention: {type(exc).__name__}")
        if index < len(THEMES) - 1:
            time.sleep(0.8)
        try:
            validation = product_validation(theme_id)
        except Exception as exc:
            validation = old.get("validation")
            errors.append(f"validation: {type(exc).__name__}")
        capacity = capacities.get(theme_id) or old.get("capacity")
        verified = bool(attention and validation and capacity)
        items.append({
            "id": theme_id, "query": query, "boardCode": board, "verified": verified,
            "attention": attention, "validation": validation, "capacity": capacity,
            "errors": errors,
        })
    attention_values = sorted(
        item["attention"]["recent30Articles"] for item in items if item["verified"]
    )
    if attention_values:
        for item in items:
            if not item["verified"]:
                continue
            value = item["attention"]["recent30Articles"]
            lower = attention_values.index(value)
            upper = len(attention_values) - 1 - attention_values[::-1].index(value)
            percentile = ((lower + upper) / 2 + 1) / len(attention_values)
            item["attention"]["score"] = round(25 + percentile * 65, 1)
            item["attention"]["scoreMethod"] = "本期已验证方向的近30日媒体文章数横截面百分位"
    verified_count = sum(bool(item["verified"]) for item in items)
    ranked = sorted(
        (item for item in items if item["verified"]),
        key=lambda item: item["attention"]["score"] * 0.35 + item["validation"]["score"] * 0.45 + item["capacity"]["score"] * 0.20,
        reverse=True,
    )
    recommended_ids = [item["id"] for item in ranked[:10]]
    output = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(),
        "methodologyVersion": "attention-public-proxy-v2",
        "universeCount": 36,
        "mappedCount": len(THEMES),
        "verifiedCount": verified_count,
        "recommendedIds": recommended_ids,
        "items": items,
        "disclosure": "媒体注意力为公开代理，产品市场验证来自基金规模与新发数据；均不替代企业经营、客户调研或投资结论。",
    }
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT}: {verified_count}/{len(THEMES)} mapped themes verified")
    if verified_count == 0:
        raise SystemExit("no theme retained a complete real-data snapshot")


if __name__ == "__main__":
    main()
