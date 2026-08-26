"""Build the public-data snapshot for the social-attention foresight map.

The two axes intentionally use observable proxies:
- social attention: Baidu Hot Search and Toutiao Hot Board, cross-checked with
  GDELT's media-agenda timeline;
- product-market validation: comparable fund scale growth and new launches.

Neither proxy is labelled as enterprise revenue or a customer survey.  Themes
without both series remain in the research universe but receive no coordinates.
"""
from __future__ import annotations

import json
import math
import os
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import fmean

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "attention_pool_evidence.json"
ATTENTION_HISTORY = ROOT / "public" / "social_attention_history.json"
PRE_EVIDENCE = ROOT / "public" / "pre_research_evidence.json"
FUND_PRODUCTS = ROOT / "public" / "fund_products.json"


def atomic_write_json(path: Path, payload: dict) -> None:
    """Publish a complete JSON document or leave the previous snapshot intact."""
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)

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

THEME_TERMS = {
    "ai-agent": ["人工智能", "AI智能体", "大模型", "推理算力", "算力"],
    "embodied-ai": ["具身智能", "人形机器人", "机器人劳动力", "宇树机器人"],
    "space": ["商业航天", "卫星互联网", "低轨卫星", "火箭发射"],
    "power": ["智能电网", "新型电力系统", "算力能源", "电网建设"],
    "hard-tech": ["半导体设备", "国产芯片", "工业母机", "自主可控"],
    "biotech": ["创新药", "新药", "癌症疫苗", "医药出海"],
    "longevity": ["银发经济", "养老产业", "养老服务", "康养"],
    "experience": ["文旅消费", "情绪消费", "体验消费", "IP消费"],
    "resources": ["战略资源", "稀土", "关键矿产", "先进材料"],
    "future-tech": ["量子科技", "脑机接口", "6G", "未来产业"],
    "industrial-software": ["工业软件", "工业互联网", "智能工厂", "自主生产"],
    "ai-application": ["AI应用", "人工智能应用", "AI办公", "数字生产力"],
    "cybersecurity": ["网络安全", "数据安全", "信息安全", "AI安全"],
    "smart-healthcare": ["AI医疗", "医疗大模型", "人工智能诊断", "智慧医疗"],
    "synthetic-biology": ["合成生物", "生物制造", "细胞工厂"],
    "nuclear-energy": ["核聚变", "核能", "核电", "可控核聚变"],
    "water-security": ["水资源", "水利建设", "节水", "水安全"],
    "low-altitude": ["低空经济", "飞行汽车", "城市空中交通", "无人机"],
    "autonomous-driving": ["自动驾驶", "智能驾驶", "无人驾驶", "车联网"],
    "obesity-care": ["减肥药", "体重管理", "代谢健康", "GLP-1"],
    "climate-adaptation": ["气候适应", "韧性城市", "极端天气", "地下管网"],
    "digital-health": ["数字健康", "居家诊疗", "互联网医疗", "远程医疗"],
    "mental-health": ["精神健康", "心理健康", "情绪服务", "心理咨询"],
    "pet-economy": ["宠物经济", "宠物健康", "宠物消费", "陪伴经济"],
    "sports-outdoor": ["户外运动", "运动健康", "体育消费", "户外生活"],
    "inbound-consumption": ["入境消费", "入境游", "中国旅行", "免签"],
    "new-food": ["功能营养", "新食品", "保健食品", "功能食品"],
    "recycling": ["循环经济", "再制造", "再生资源", "废旧回收"],
    "grid-storage": ["长时储能", "新型储能", "电网调节", "储能电站"],
    "defense-tech": ["无人系统", "智能国防", "无人装备", "军用无人机"],
    "agri-tech": ["农业科技", "粮食安全", "种业", "智慧农业"],
    "wealth-longevity": ["养老金融", "个人养老金", "养老保险", "长寿金融"],
    "human-upskilling": ["职业再训练", "职业教育", "技能培训", "AI就业"],
    "creator-economy": ["AI内容", "AI创作", "创作者经济", "短剧"],
    "ocean-economy": ["深海科技", "海洋经济", "海洋资源", "深海装备"],
    "service-robot": ["服务机器人", "家庭机器人", "家务机器人", "陪伴机器人"],
}


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def get_json(url: str, params: dict, timeout: int = 40) -> dict:
    response = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def parse_baidu_hotlist_html(html: str) -> list[dict]:
    match = re.search(r"<!--s-data:(.*?)-->", html, re.S)
    if not match:
        raise ValueError("Baidu hot-list state was not found")
    state = json.loads(match.group(1))
    cards = state.get("data", {}).get("cards") or []
    card = next((item for item in cards if item.get("component") == "hotList"), None)
    if not card:
        raise ValueError("Baidu hot-list card was not found")
    entries = card.get("content") or []
    return [{
        "title": item.get("word") or item.get("query") or "",
        "description": item.get("desc") or "", "rank": rank,
        "heat": float(item.get("hotScore") or 0),
    } for rank, item in enumerate(entries, 1) if item.get("word") or item.get("query")]


def fetch_baidu_hotlist() -> list[dict]:
    response = requests.get(
        "https://top.baidu.com/board", params={"tab": "realtime"},
        headers={**HEADERS, "Referer": "https://top.baidu.com/"}, timeout=40,
    )
    response.raise_for_status()
    return parse_baidu_hotlist_html(response.text)


def parse_toutiao_hotlist(payload: dict) -> list[dict]:
    entries = payload.get("data") or []
    return [{
        "title": item.get("Title") or "", "description": item.get("LabelDesc") or "",
        "rank": rank, "heat": float(item.get("HotValue") or 0),
    } for rank, item in enumerate(entries, 1) if item.get("Title")]


def fetch_toutiao_hotlist() -> list[dict]:
    response = requests.get(
        "https://www.toutiao.com/hot-event/hot-board/", params={"origin": "toutiao_pc"},
        headers={**HEADERS, "Referer": "https://www.toutiao.com/"}, timeout=40,
    )
    response.raise_for_status()
    return parse_toutiao_hotlist(response.json())


def load_attention_history() -> dict:
    if not ATTENTION_HISTORY.exists():
        return {"schemaVersion": 1, "snapshots": []}
    try:
        payload = json.loads(ATTENTION_HISTORY.read_text(encoding="utf-8"))
        return payload if isinstance(payload.get("snapshots"), list) else {"schemaVersion": 1, "snapshots": []}
    except (ValueError, OSError):
        return {"schemaVersion": 1, "snapshots": []}


def collect_hotlist_snapshot() -> tuple[dict, list[str]]:
    sources, errors = {}, []
    for source, fetcher in (("baidu", fetch_baidu_hotlist), ("toutiao", fetch_toutiao_hotlist)):
        try:
            entries = fetcher()
            if len(entries) < 20:
                raise ValueError(f"only {len(entries)} hot-list entries")
            sources[source] = entries
        except Exception as exc:
            errors.append(f"{source}: {type(exc).__name__}")
    return {"capturedAt": datetime.now().astimezone().isoformat(), "sources": sources}, errors


def update_attention_history(snapshot: dict) -> dict:
    history = load_attention_history()
    # The main workflow may retry on the same day. Retain each materially distinct
    # observation, but do not duplicate the same source payload within one hour.
    bucket = snapshot["capturedAt"][:13]
    snapshots = [item for item in history["snapshots"] if item.get("capturedAt", "")[:13] != bucket]
    if snapshot.get("sources"):
        snapshots.append(snapshot)
    cutoff = datetime.now().astimezone() - timedelta(days=90)
    snapshots = [item for item in snapshots if datetime.fromisoformat(item["capturedAt"]) >= cutoff]
    daily = {}
    for item in snapshots:
        day = item["capturedAt"][:10]
        bucket_data = daily.setdefault(day, {"date": day, "samples": 0, "themes": {}})
        bucket_data["samples"] += 1
        for theme_id, _query, _board in THEMES:
            summary = summarize_theme_snapshots(theme_id, [item])
            if summary["appearances"]:
                current = bucket_data["themes"].setdefault(theme_id, {"appearances": 0, "resonance": 0, "bestRank": None})
                current["appearances"] += summary["appearances"]
                current["resonance"] += summary["resonance"]
                rank = summary["bestRank"]
                current["bestRank"] = rank if current["bestRank"] is None else min(current["bestRank"], rank)
    # Daily summaries remain compact and can be retained for three years even after raw 2-hour samples expire.
    retained_daily = {item["date"]: item for item in history.get("daily", []) if item.get("date", "") < cutoff.date().isoformat()}
    retained_daily.update(daily)
    three_year_cutoff = (date.today() - timedelta(days=1095)).isoformat()
    daily_rows = [retained_daily[key] for key in sorted(retained_daily) if key >= three_year_cutoff]

    def rollup(period: str) -> list[dict]:
        groups = {}
        for row in daily_rows:
            current_date = date.fromisoformat(row["date"])
            key = current_date.strftime("%Y-%m") if period == "month" else f"{current_date.isocalendar().year}-W{current_date.isocalendar().week:02d}"
            target = groups.setdefault(key, {"period": key, "activeDays": 0, "themes": {}})
            target["activeDays"] += 1
            for theme_id, values in row.get("themes", {}).items():
                merged = target["themes"].setdefault(theme_id, {"appearances": 0, "resonance": 0, "activeDays": 0, "bestRank": None})
                merged["appearances"] += values.get("appearances", 0)
                merged["resonance"] += values.get("resonance", 0)
                merged["activeDays"] += 1
                rank = values.get("bestRank")
                if rank is not None:
                    merged["bestRank"] = rank if merged["bestRank"] is None else min(merged["bestRank"], rank)
        previous_key = "monthly" if period == "month" else "weekly"
        previous_groups = {row.get("period"): row for row in history.get(previous_key, []) if row.get("period")}
        # The first retained daily period may be partial because the three-year
        # cutoff can fall mid-week/month. Preserve its previously complete rollup.
        if groups:
            first_current = min(groups)
            if first_current in previous_groups:
                groups[first_current] = previous_groups[first_current]
        previous_groups.update(groups)
        return [previous_groups[key] for key in sorted(previous_groups)]

    history = {"schemaVersion": 2, "generatedAt": snapshot["capturedAt"], "retention": {"rawDays": 90, "dailyDays": 1095, "weekly": "permanent", "monthly": "permanent"}, "snapshots": snapshots, "daily": daily_rows, "weekly": rollup("week"), "monthly": rollup("month")}
    atomic_write_json(ATTENTION_HISTORY, history)
    return history


def matched_theme(entry: dict, theme_id: str) -> bool:
    text = f"{entry.get('title', '')} {entry.get('description', '')}".lower()
    return any(term.lower() in text for term in THEME_TERMS[theme_id])


def summarize_theme_snapshots(theme_id: str, snapshots: list[dict]) -> dict:
    appearances = resonance = 0
    weighted = 0.0
    days, source_hits, best_rank = set(), set(), None
    for snapshot in snapshots:
        matched_sources = 0
        for source, entries in snapshot.get("sources", {}).items():
            matches = [entry for entry in entries if matched_theme(entry, theme_id)]
            if not matches:
                continue
            matched_sources += 1
            source_hits.add(source)
            rank = min(entry["rank"] for entry in matches)
            best_rank = rank if best_rank is None else min(best_rank, rank)
            appearances += 1
            weighted += max(0, 51 - rank) / 50
        if matched_sources:
            days.add(snapshot["capturedAt"][:10])
        if matched_sources >= 2:
            resonance += 1
    return {"appearances": appearances, "resonance": resonance, "weighted": weighted,
            "days": len(days), "sourceCount": len(source_hits), "bestRank": best_rank}


def attention_maturity(observed_days: int) -> dict:
    if observed_days < 7:
        weight, label = .05, "当日异动"
    elif observed_days < 30:
        weight, label = .10, "短期扩散"
    elif observed_days < 90:
        weight, label = .20, "初步趋势"
    else:
        weight, label = .35, "生命周期"
    return {"observedDays": observed_days, "tier": label, "effectiveWeight": weight,
            "targetDays": 90, "sampleAdequate": observed_days >= 90}


def gdelt_media_agenda(theme_id: str) -> dict | None:
    if os.getenv("GDELT_ENABLED", "1") == "0":
        return None
    terms = THEME_TERMS[theme_id][:3]
    query = "(" + " OR ".join(f'\"{term}\"' for term in terms) + ") sourcelang:Chinese"
    payload = get_json(
        "https://api.gdeltproject.org/api/v2/doc/doc",
        {"query": query, "mode": "timelinevol", "format": "json", "timespan": "3months"},
        timeout=60,
    )
    timelines = payload.get("timeline") or []
    points = timelines[0].get("data", []) if timelines else []
    values = [float(item.get("value") or 0) for item in points]
    if not values:
        raise ValueError("GDELT returned no timeline values")
    split = max(1, len(values) // 3)
    recent, prior = fmean(values[-split:]), fmean(values[-2 * split:-split] or [0])
    acceleration = (recent / max(prior, 0.000001) - 1) * 100
    return {
        "recent30Share": round(recent, 6), "prior30Share": round(prior, 6),
        "accelerationPercent": round(acceleration, 1), "samplePoints": len(values),
        "source": "GDELT DOC 2.0中文媒体报道占比",
        "sourceUrl": "https://api.gdeltproject.org/api/v2/doc/doc",
    }


def social_attention(theme_id: str, history: dict, media_agenda: dict | None = None) -> dict:
    now = datetime.now().astimezone()
    recent_cutoff, prior_cutoff = now - timedelta(days=7), now - timedelta(days=14)
    recent = [item for item in history["snapshots"] if datetime.fromisoformat(item["capturedAt"]) >= recent_cutoff]
    prior = [item for item in history["snapshots"] if prior_cutoff <= datetime.fromisoformat(item["capturedAt"]) < recent_cutoff]

    month = [item for item in history["snapshots"] if datetime.fromisoformat(item["capturedAt"]) >= now - timedelta(days=30)]
    current, before, rolling_month = summarize_theme_snapshots(theme_id, recent), summarize_theme_snapshots(theme_id, prior), summarize_theme_snapshots(theme_id, month)
    acceleration = (current["weighted"] / max(before["weighted"], 0.25) - 1) * 100 if current["weighted"] else -100
    observed7 = len({item["capturedAt"][:10] for item in recent})
    observed30 = len({item["capturedAt"][:10] for item in month})
    persistence7 = min(1, current["days"] / max(3, min(7, observed7)))
    persistence30 = min(1, rolling_month["days"] / max(7, min(30, observed30)))
    resonance = min(1, current["resonance"] / max(1, len(recent)))
    rank_strength = max(0, 51 - (current["bestRank"] or 51)) / 50
    acceleration_factor = (clamp(acceleration, -100, 200) + 100) / 300
    agenda_factor = 0
    if media_agenda:
        agenda_factor = (clamp(media_agenda["accelerationPercent"], -100, 200) + 100) / 300
    score = 25 * resonance + 20 * persistence7 + 15 * persistence30 + 15 * rank_strength + 15 * acceleration_factor + 10 * agenda_factor
    observed_days = len({item["capturedAt"][:10] for item in history["snapshots"]})
    status = ("社会共振" if current["resonance"] >= 2 else "加速扩散" if current["appearances"] and acceleration >= 50
              else "开始扩散" if current["appearances"] else "注意力消退" if rolling_month["appearances"]
              else "媒体萌芽" if media_agenda and media_agenda.get("accelerationPercent", 0) > 25 else "未破圈")
    return {
        "score": round(clamp(score), 1), "statusLabel": status,
        "recent7Appearances": current["appearances"], "prior7Appearances": before["appearances"],
        "crossPlatformHits7d": current["resonance"], "activeDays7d": current["days"],
        "recent30Appearances": rolling_month["appearances"],
        "crossPlatformHits30d": rolling_month["resonance"], "activeDays30d": rolling_month["days"],
        "bestRank7d": current["bestRank"], "accelerationPercent": round(acceleration, 1),
        "observedDays": observed_days, "mediaAgenda": media_agenda,
        "source": "百度热搜 × 头条热榜" + (" × GDELT" if media_agenda else ""),
        "sourceUrl": "https://top.baidu.com/board?tab=realtime",
        "status": "真实公开代理",
        "scoreMethod": "双平台共振25%＋7日持续性20%＋30日持续性15%＋排名强度15%＋7日加速度15%＋GDELT媒体议程10%",
        "note": "热榜确认公众注意力是否破圈；未上榜不等于没有关注。历史窗口按实际积累的有效观测日计算。",
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
    scale_values = sorted((item.get("currentScaleYi") or 0 for item in peers), reverse=True)
    top1_share = scale_values[0] / total * 100 if total and scale_values else 0
    top3_share = sum(scale_values[:3]) / total * 100 if total else 0
    effective = sum(value >= 2 for value in scale_values)
    positive = sum((item.get("scaleNetIncreaseYi") or 0) > 0 for item in comparable)
    breadth = positive / len(comparable) * 100 if comparable else 0
    flow_proxy = 0.0
    flow_comparable = 0
    positive_flow = 0
    for item in comparable:
        nav_growth = item.get("navGrowthPercent")
        if not isinstance(nav_growth, (int, float)):
            continue
        estimated = item["currentScaleYi"] - item["baselineScaleYi"] * (1 + nav_growth / 100)
        flow_proxy += estimated
        flow_comparable += 1
        positive_flow += estimated > 0
    today = date.today()
    launched = 0
    for item in peers:
        try:
            established = datetime.strptime(item.get("establishedDate") or "", "%Y-%m-%d").date()
        except ValueError:
            continue
        launched += established >= today - timedelta(days=365)
    return {
        "score": 0, "peerFunds": len(peers), "comparableFunds": len(comparable),
        "currentScaleYi": round(total, 1), "scaleNetIncreaseYi": round(increase, 1),
        "scaleGrowthPercent": round(growth, 1), "launched12Months": launched,
        "estimatedNetFlowYi": round(flow_proxy, 1), "flowComparableFunds": flow_comparable,
        "positiveFlowFunds": positive_flow,
        "growthBreadthPercent": round(breadth, 1), "positiveGrowthFunds": positive,
        "effectiveFunds": effective, "effectiveScaleThresholdYi": 2,
        "top1SharePercent": round(top1_share, 1), "top3SharePercent": round(top3_share, 1),
        "asOf": payload.get("updateTime"), "source": "AI Fund Mate全市场公开基金快照",
        "sourceUrl": "/fund_products.json", "status": "真实公开数据",
        "note": "同时衡量规模净增加绝对额、增长率、净流入代理、增长广度、有效产品数和集中度；规模变化不直接等同净申购。",
    }


def percentile(values: list[float], value: float) -> float:
    if not values:
        return 0
    ordered = sorted(values)
    lower = ordered.index(value)
    upper = len(ordered) - 1 - ordered[::-1].index(value)
    return ((lower + upper) / 2 + 1) / len(ordered) * 100


def rescore_product_validations(items: list[dict]) -> None:
    validations = [item["validation"] for item in items if item.get("validation")]
    fields = ("estimatedNetFlowYi", "scaleNetIncreaseYi", "scaleGrowthPercent", "effectiveFunds", "currentScaleYi", "launched12Months")
    distributions = {field: [float(item.get(field) or 0) for item in validations] for field in fields}
    for validation in validations:
        components = {
            "estimatedNetFlow": percentile(distributions["estimatedNetFlowYi"], float(validation.get("estimatedNetFlowYi") or 0)),
            "absoluteScaleIncrease": percentile(distributions["scaleNetIncreaseYi"], float(validation.get("scaleNetIncreaseYi") or 0)),
            "scaleGrowthRate": percentile(distributions["scaleGrowthPercent"], float(validation.get("scaleGrowthPercent") or 0)),
            "growthBreadth": float(validation.get("growthBreadthPercent") or 0),
            "concentrationBalance": 100 - float(validation.get("top1SharePercent") or 0),
            "effectiveProducts": percentile(distributions["effectiveFunds"], float(validation.get("effectiveFunds") or 0)),
            "currentScale": percentile(distributions["currentScaleYi"], float(validation.get("currentScaleYi") or 0)),
            "newLaunches": percentile(distributions["launched12Months"], float(validation.get("launched12Months") or 0)),
        }
        score = (components["estimatedNetFlow"] * .25 + components["absoluteScaleIncrease"] * .15 +
                 components["scaleGrowthRate"] * .10 + components["growthBreadth"] * .15 +
                 components["concentrationBalance"] * .10 + components["effectiveProducts"] * .10 +
                 components["currentScale"] * .10 + components["newLaunches"] * .05)
        validation["score"] = round(clamp(score), 1)
        validation["scoreComponents"] = {key: round(value, 1) for key, value in components.items()}
        validation["scoreMethod"] = "净流入代理25%＋规模净增加额15%＋增长率10%＋增长广度15%＋集中度10%＋有效产品数10%＋当前规模10%＋近12月新发5%"


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


def load_previous_payload() -> dict:
    if not OUT.exists():
        return {}
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def load_previous() -> dict:
    try:
        return {item["id"]: item for item in load_previous_payload().get("items", [])}
    except (KeyError, TypeError):
        return {}


def update_ranking_history(previous_payload: dict, ranked_ids: list[str], recommended_ids: list[str], current_date: str, quarter: str, scores: dict | None = None) -> list[dict]:
    history = [row for row in previous_payload.get("rankingHistory", []) if row.get("date") != current_date]
    row = {"date": current_date, "period": quarter, "recommendedIds": recommended_ids, "rankedIds": ranked_ids}
    if scores:
        row["scores"] = scores
    history.append(row)
    return history[-1095:]


def main() -> None:
    previous_payload = load_previous_payload()
    previous = load_previous()
    hotlist_snapshot, collection_errors = collect_hotlist_snapshot()
    history = update_attention_history(hotlist_snapshot)
    capacities = asset_capacity()
    items = []
    gdelt_enabled = os.getenv("GDELT_ENABLED", "1") != "0"
    for index, (theme_id, query, board) in enumerate(THEMES):
        old = previous.get(theme_id, {})
        errors = list(collection_errors)
        media_agenda = None
        if gdelt_enabled:
            try:
                media_agenda = gdelt_media_agenda(theme_id)
            except Exception as exc:
                media_agenda = (old.get("attention") or {}).get("mediaAgenda")
                errors.append(f"gdelt: {type(exc).__name__}")
                if isinstance(exc, requests.HTTPError) and exc.response is not None and exc.response.status_code == 429:
                    gdelt_enabled = False
        attention = social_attention(theme_id, history, media_agenda) if hotlist_snapshot.get("sources") else old.get("attention")
        if index < len(THEMES) - 1:
            time.sleep(5.2 if gdelt_enabled else 0.1)
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
    rescore_product_validations(items)
    verified_count = sum(bool(item["verified"]) for item in items)
    observed_days = max((item["attention"]["observedDays"] for item in items if item.get("attention")), default=0)
    maturity = attention_maturity(observed_days)
    attention_weight = maturity["effectiveWeight"]
    validation_weight = (1 - attention_weight) * 45 / 65
    capacity_weight = (1 - attention_weight) * 20 / 65
    ranked = sorted(
        (item for item in items if item["verified"]),
        key=lambda item: item["attention"]["score"] * attention_weight + item["validation"]["score"] * validation_weight + item["capacity"]["score"] * capacity_weight,
        reverse=True,
    )
    quarter = f"{date.today().year}-Q{(date.today().month - 1) // 3 + 1}"
    previous_ids = previous_payload.get("recommendedIds") or []
    previous_quarter = previous_payload.get("recommendationReviewQuarter")
    force_review = os.getenv("FORCE_CORE_REVIEW", "0") == "1"
    recommended_ids = previous_ids if len(previous_ids) == 10 and previous_quarter == quarter and not force_review else [item["id"] for item in ranked[:10]]
    today = date.today().isoformat()
    score_snapshot = {
        item["id"]: {
            "attention": round(item["attention"]["score"], 2),
            "validation": round(item["validation"]["score"], 2),
            "capacity": round(item["capacity"]["score"], 2),
        }
        for item in ranked
    }
    ranking_history = update_ranking_history(previous_payload, [item["id"] for item in ranked], recommended_ids, today, quarter, score_snapshot)
    output = {
        "schemaVersion": 2,
        "generatedAt": datetime.now().astimezone().isoformat(),
        "methodologyVersion": "cn-hotlists-gdelt-v1",
        "universeCount": 36,
        "mappedCount": len(THEMES),
        "verifiedCount": verified_count,
        "recommendedIds": recommended_ids,
        "recommendationReviewQuarter": quarter,
        "recommendationPolicy": "核心10原则上按季度重排；重大政策、技术或企业证伪事件可通过FORCE_CORE_REVIEW触发临时复核。",
        "rankingHistory": ranking_history,
        "items": items,
        "attentionObservationDays": observed_days,
        "attentionMaturity": maturity,
        "rankingWeights": {"attention": round(attention_weight, 4), "validation": round(validation_weight, 4), "capacity": round(capacity_weight, 4)},
        "historyCoverage": {"rawSamples": len(history.get("snapshots", [])), "daily": len(history.get("daily", [])), "weekly": len(history.get("weekly", [])), "monthly": len(history.get("monthly", []))},
        "attentionSources": ["百度热搜", "头条热榜", "GDELT DOC 2.0（早期媒体议程）"],
        "disclosure": "社会注意力由百度热搜与头条热榜交叉验证，GDELT仅识别早期媒体议程；未上榜不等于没有关注。产品市场验证来自基金规模与新发数据。",
    }
    atomic_write_json(OUT, output)
    print(f"wrote {OUT}: {verified_count}/{len(THEMES)} mapped themes verified")
    if verified_count == 0:
        raise SystemExit("no theme retained a complete real-data snapshot")


if __name__ == "__main__":
    main()
