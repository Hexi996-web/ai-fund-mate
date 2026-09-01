"""Build three-layer evidence for every direction in the 36-theme mother pool.

Free public data is intentionally separated by what it can prove:
- structure: a theme-specific metric contract (no score until official history exists);
- enterprise: revenue/profit/cash-flow breadth for the largest constituents;
- assets: full constituent count, liquidity and concentration.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import median

import requests

try:
    from scripts.update_attention_pool import HEADERS, THEMES
except ModuleNotFoundError:  # Direct execution: python scripts/update_three_layer_evidence.py
    from update_attention_pool import HEADERS, THEMES

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "pre_research_evidence.json"
ATTENTION = ROOT / "public" / "attention_pool_evidence.json"
DEMAND_SOURCES = ROOT / "public" / "industry_demand_sources.json"

STRUCTURE_CONTRACTS = {
    "ai-agent": ("模型调用与软件商业化", ["软件业务收入", "云计算使用量", "AI招投标数量"], "工信部／政府采购公开数据"),
    "embodied-ai": ("机器人产量与真实部署", ["工业机器人产量", "机器人密度", "批量订单"], "国家统计局／工信部"),
    "space": ("空间基础设施建设", ["年度发射次数", "在轨卫星数量", "卫星应用收入"], "国家航天局／工信部"),
    "power": ("电网投资与负荷增长", ["电网投资完成额", "全社会用电量", "跨区输电能力"], "国家能源局／国家统计局"),
    "hard-tech": ("关键设备国产化", ["集成电路产量", "半导体设备收入", "设备进口依赖度"], "国家统计局／海关总署"),
    "biotech": ("创新药研发与商业授权", ["IND/NDA数量", "License-out金额", "创新药销售收入"], "国家药监局／上市公司公告"),
    "longevity": ("老龄人口与服务供给", ["65岁以上人口", "养老床位", "长期护理险覆盖"], "国家统计局／民政部"),
    "experience": ("服务与体验消费迁移", ["旅游人次", "文娱支出", "服务零售额"], "文旅部／国家统计局"),
    "resources": ("关键矿产供需约束", ["主要矿产产量", "进口依赖度", "库存消费比"], "自然资源部／海关总署"),
    "future-tech": ("未来技术工程化", ["研发投入", "示范项目数量", "技术合同额"], "科技部／工信部"),
    "industrial-software": ("制造业软件化", ["工业软件收入", "数字化研发工具普及率", "智能工厂数量"], "工信部"),
    "ai-application": ("AI应用商业渗透", ["AI软件收入", "企业采用率", "付费客户数量"], "工信部／上市公司公告"),
    "cybersecurity": ("安全支出刚性", ["网络安全收入", "安全采购金额", "数据合规投入"], "工信部／政府采购公开数据"),
    "smart-healthcare": ("AI医疗临床采用", ["获批AI医疗器械", "医院采购金额", "覆盖医疗机构"], "国家药监局／卫健委"),
    "synthetic-biology": ("生物制造规模化", ["示范产线", "单位制造成本", "生物制造收入"], "工信部／上市公司公告"),
    "nuclear-energy": ("先进核能工程周期", ["核准机组", "在建装机", "设备投资额"], "国家能源局"),
    "water-security": ("水安全资本开支", ["水利投资完成额", "再生水利用率", "供水管网更新"], "水利部／住建部"),
    "climate-adaptation": ("气候韧性投入", ["防灾减灾投资", "极端天气损失", "韧性城市项目"], "应急管理部／住建部"),
    "low-altitude": ("低空商业运营", ["商业航线数量", "飞行小时", "付费运营收入"], "民航局／地方公开数据"),
    "autonomous-driving": ("驾驶自动化渗透", ["高阶智驾渗透率", "测试里程", "用户付费率"], "工信部／企业公告"),
    "digital-health": ("医疗服务居家化", ["互联网诊疗量", "远程医疗覆盖", "支付方覆盖"], "卫健委／医保局"),
    "obesity-care": ("体重管理治疗渗透", ["获批适应症", "处方量", "支付覆盖"], "国家药监局／医保局"),
    "mental-health": ("精神健康需求释放", ["诊疗人次", "精神卫生床位", "心理服务支出"], "卫健委／国家统计局"),
    "pet-economy": ("陪伴消费持续化", ["宠物数量", "宠物医疗渗透率", "食品零售额"], "农业农村部／上市公司公告"),
    "sports-outdoor": ("运动参与和消费", ["经常锻炼人数", "体育用品零售额", "户外活动人次"], "体育总局／国家统计局"),
    "inbound-consumption": ("入境消费恢复", ["入境游客消费", "入境人次", "国际航班量"], "文旅部／民航局"),
    "new-food": ("功能营养渗透", ["新品注册数量", "功能食品零售额", "复购率"], "市场监管总局／上市公司公告"),
    "recycling": ("资源循环利用", ["再生资源回收量", "再生材料产量", "产能利用率"], "商务部／国家统计局"),
    "grid-storage": ("系统调节需求", ["新型储能装机", "平均利用小时", "独立储能收益"], "国家能源局"),
    "defense-tech": ("无人装备结构升级", ["相关采购公告", "研发投入", "军民收入边界"], "政府采购公开数据／企业公告"),
    "agri-tech": ("农业效率与安全", ["粮食单产", "高标准农田", "农业机械化率"], "农业农村部／国家统计局"),
    "wealth-longevity": ("养老支付制度化", ["个人养老金开户", "养老金融规模", "领取覆盖率"], "人社部／金融监管总局"),
    "human-upskilling": ("职业技能迁移", ["职业培训人次", "企业培训支出", "培训后就业率"], "人社部／教育部"),
    "creator-economy": ("内容商业化重构", ["数字内容收入", "创作者分成", "付费用户数"], "国家统计局／企业公告"),
    "ocean-economy": ("海洋开发工程化", ["海洋生产总值", "海工装备订单", "深海项目数量"], "自然资源部／企业公告"),
    "service-robot": ("家庭服务机器人采用", ["服务机器人产量", "家庭保有量", "复购与活跃率"], "国家统计局／企业公告"),
}

STRUCTURE_SERIES = {
    "embodied-ai": ("https://s.askci.com/data/industry/a020922/", "工业机器人月产量", "套"),
    "service-robot": ("https://s.askci.com/data/industry/a02092u/", "服务机器人月产量", "套"),
    "hard-tech": ("https://s.askci.com/data/industry/a02092q/", "集成电路月产量", "亿块"),
    "autonomous-driving": ("https://s.askci.com/data/industry/a0209202605a/", "新能源汽车月产量", "万辆"),
    "grid-storage": ("https://s.askci.com/data/industry/a02092d/", "锂离子电池月产量", "万只"),
    "nuclear-energy": ("https://s.askci.com/data/energy/a03010j/", "核能月发电量", "亿千瓦时"),
    "agri-tech": ("https://s.askci.com/data/industry/a02091y/", "大型拖拉机月产量", "台"),
}

CORE_DEMAND_WEIGHTS = (45, 35, 20)


def same_month_yoy(rows: list[dict]) -> float | None:
    if not rows or not rows[-1].get("date"):
        return None
    latest = rows[-1]
    year, month = latest["date"].split("-")
    base = next((row for row in rows if row.get("date") == f"{int(year) - 1}-{month}"), None)
    current_value, base_value = number(latest.get("value")), number((base or {}).get("value"))
    return (current_value / base_value - 1) * 100 if base_value else None


def demand_assessment(contract: tuple, structure: dict, connected_sources: list[dict] | None = None) -> dict:
    """Keep missing demand evidence neutral and cap any single supply proxy."""
    core_indicators = [
        {"name": metric, "role": role, "baseWeightPercent": weight, "status": "待接入"}
        for metric, role, weight in zip(contract[1], ("核心需求结果", "渗透与采用", "供需与约束"), CORE_DEMAND_WEIGHTS)
    ]
    observations = []
    for source in connected_sources or []:
        source_rows = source.get("observations") or []
        latest = source_rows[-1] if source_rows else {}
        yoy = latest.get("yoyPercent")
        if source.get("status") != "active" or yoy is None:
            continue
        required = 13 if source.get("cadence") == "monthly" else 2
        continuity = min(1, len(source_rows) / required)
        effective_weight = float(source.get("baseWeightPercent") or 0) * continuity
        signal_score = 50 + 50 * math.tanh(float(yoy) / 25)
        contribution = effective_weight / 100 * (signal_score - 50)
        observations.append({
            "name": source.get("metricName"), "role": source.get("role"), "latestDate": latest.get("dataDate"),
            "latestValue": latest.get("value"), "unit": latest.get("unit"), "yoyPercent": round(float(yoy), 1),
            "baseWeightPercent": source.get("baseWeightPercent"), "effectiveWeightPercent": round(effective_weight, 1),
            "signalScore": round(signal_score, 1), "contributionPoints": round(contribution, 1),
            "source": source.get("sourceName"), "sourceUrl": source.get("sourceUrl"),
            "cadence": source.get("cadence"), "nextCheckAt": source.get("nextCheckAt"),
            "interpretation": "该指标属于核心需求合同，按自身发布周期更新。",
        })
        for indicator in core_indicators:
            if indicator["name"] == source.get("metricName"):
                indicator.update({"status": "已接入", "latestDate": latest.get("dataDate")})
    rows = structure.get("history") or []
    yoy = same_month_yoy(rows)
    if len(rows) >= 4 and yoy is not None:
        # Existing production series are useful corroboration, but cannot confirm broad demand alone.
        continuity = min(1, len(rows) / 12)
        source_factor = .60 if "中商产业数据库" in (structure.get("source") or "") else .80
        effective_weight = 15 * continuity * source_factor
        signal_score = 50 + 50 * math.tanh(yoy / 25)
        contribution = effective_weight / 100 * (signal_score - 50)
        observations.append({
            "name": structure.get("metric"), "role": "辅助供给代理", "latestDate": rows[-1].get("date"),
            "latestValue": rows[-1].get("value"), "unit": structure.get("unit"), "yoyPercent": round(yoy, 1),
            "baseWeightPercent": 15, "effectiveWeightPercent": round(effective_weight, 1),
            "signalScore": round(signal_score, 1), "contributionPoints": round(contribution, 1),
            "source": structure.get("source"), "sourceUrl": structure.get("sourceUrl"),
            "interpretation": "仅反映供给活动，不能单独确认整个方向的终端需求。",
        })
    score = round(max(0, min(100, 50 + sum(item["contributionPoints"] for item in observations))), 1)
    label = "核心需求增强" if score >= 70 else "需求温和改善" if score >= 58 else "需求待验证" if score >= 42 else "需求边际弱化" if score >= 30 else "核心需求收缩"
    return {
        "version": "multi-signal-demand-v1", "title": contract[0], "score": score, "label": label,
        "coreIndicators": core_indicators, "observations": observations,
        "method": "以50为中性基准；指标按基础权重、来源、新鲜度与连续性折算有效权重，缺失指标不重新分配权重。",
    }

PUBLIC_SERIES_PENDING = {
    "space", "power", "biotech", "longevity", "experience", "resources",
    "industrial-software", "cybersecurity", "smart-healthcare", "water-security",
    "climate-adaptation", "digital-health", "obesity-care", "mental-health",
    "sports-outdoor", "inbound-consumption", "recycling", "ocean-economy",
}

CATALYST_TYPES = (
    ("证伪事件", ("终止", "延期", "撤回", "失败", "停产", "减产", "处罚"), "原有产业假设是否被削弱", "negative"),
    ("订单与采购", ("中标", "订单", "合同", "签订", "采购"), "是否出现真实付费需求", "positive"),
    ("准入与审批", ("获批", "批准", "注册证", "许可", "核准"), "商业化准入是否打开", "positive"),
    ("投产与运营", ("投产", "量产", "商业运营", "上线", "交付", "并网"), "是否进入规模化供给或使用", "positive"),
    ("项目执行", ("开工", "验收", "发射"), "项目是否从规划进入执行", "positive"),
)


def clean_html(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value or "").strip()


def cninfo_catalysts(query: str, window_days: int = 120) -> list[dict]:
    """Keep only disclosure events that can confirm or falsify real demand."""
    end = date.today()
    response = requests.post(
        "http://www.cninfo.com.cn/new/hisAnnouncement/query",
        data={"tabName": "fulltext", "pageSize": "50", "pageNum": "1", "column": "szse",
              "category": "", "plate": "", "searchkey": query, "secid": "", "trade": "",
              "seDate": f"{end - timedelta(days=window_days)}~{end}", "stock": "",
              "sortName": "pubdate", "sortType": "desc", "isHLtitle": "true"},
        headers={"User-Agent": HEADERS.get("User-Agent", "Mozilla/5.0"),
                 "Referer": "http://www.cninfo.com.cn/", "X-Requested-With": "XMLHttpRequest"}, timeout=40,
    )
    response.raise_for_status()
    events, seen = [], set()
    for row in response.json().get("announcements") or []:
        title = clean_html(row.get("announcementTitle"))
        match = next(((label, validates, impact) for label, words, validates, impact in CATALYST_TYPES
                      if any(word in title for word in words)), None)
        if not match or title in seen:
            continue
        seen.add(title)
        label, validates, impact = match
        timestamp = row.get("announcementTime")
        event_date = datetime.fromtimestamp(timestamp / 1000).date().isoformat() if timestamp else None
        events.append({"date": event_date, "type": label, "impact": impact, "validates": validates,
                       "company": clean_html(row.get("secName")), "title": title,
                       "source": "巨潮资讯上市公司公告",
                       "sourceUrl": f"https://static.cninfo.com.cn/{row.get('adjunctUrl')}" if row.get("adjunctUrl") else ""})
        if len(events) == 5:
            break
    return events


def merge_catalyst_history(old_structure: dict, structure: dict) -> list[dict]:
    """Archive decision-changing events for later thesis validation."""
    cutoff = (date.today() - timedelta(days=1095)).isoformat()
    merged = {}
    rows = (old_structure.get("catalystHistory") or []) + (old_structure.get("catalysts") or []) + (structure.get("catalysts") or [])
    for event in rows:
        if event.get("date") and event["date"] < cutoff:
            continue
        key = event.get("sourceUrl") or f"{event.get('date')}|{event.get('company')}|{event.get('title')}"
        merged[key] = event
    return sorted(merged.values(), key=lambda event: event.get("date") or "", reverse=True)


def get_json(url: str, params: dict) -> dict:
    last_error = None
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, headers=HEADERS, timeout=15)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise last_error


def structure_history(theme_id: str) -> dict:
    config = STRUCTURE_SERIES.get(theme_id)
    if not config:
        status = "公开数据可接入，尚未自动化" if theme_id in PUBLIC_SERIES_PENDING else "无稳定统一免费序列"
        return {"history": [], "status": status, "accessStatus": status}
    url, metric, unit = config
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    text = response.text
    dates_match = re.search(r"xAxis:\s*\[\s*\{.*?data:\s*\[([^\]]+)\]", text, re.S)
    values_match = re.search(r"series:\s*\[\s*\{.*?data:\s*\[([^\]]*)\]", text, re.S)
    if not dates_match or not values_match:
        raise ValueError("structure series not found")
    dates = re.findall(r"['\"](\d{6})['\"]", dates_match.group(1))
    raw_values = values_match.group(1).split(",")
    rows = []
    for period, raw in zip(dates, raw_values):
        value = number(raw.strip()) if raw.strip() else None
        if value is not None:
            rows.append({"date": f"{period[:4]}-{period[4:]}", "value": value})
    return {"metric": metric, "unit": unit, "history": list(reversed(rows[:36])),
            "source": "国家统计局口径／中商产业数据库公开页", "sourceUrl": url,
            "status": "真实连续数据" if len(rows) >= 4 else "数据不足", "accessStatus": "已自动接入"}


def constituents(board: str) -> list[dict]:
    params = {"pn": 1, "pz": 100, "po": 1, "np": 1, "fltt": 2, "invt": 2,
              "fid": "f21", "fs": f"b:{board}", "fields": "f12,f14,f6,f20,f21"}
    payload = get_json("https://push2delay.eastmoney.com/api/qt/clist/get", params)
    data = payload.get("data") or {}
    rows = list(data.get("diff") or [])
    pages = math.ceil(int(data.get("total") or len(rows)) / params["pz"])
    for page in range(2, pages + 1):
        time.sleep(.35)
        params["pn"] = page
        more = get_json("https://push2delay.eastmoney.com/api/qt/clist/get", params)
        rows.extend(((more.get("data") or {}).get("diff") or []))
    return list({row.get("f12"): row for row in rows if row.get("f12")}.values())


def board_history(board: str) -> list[dict]:
    payload = get_json("https://push2his.eastmoney.com/api/qt/stock/kline/get", {
        "secid": f"90.{board}", "klt": 101, "fqt": 1, "lmt": 300, "end": "20500101",
        "fields1": "f1,f2,f3", "fields2": "f51,f52,f53,f56,f57",
    })
    result = []
    for line in (payload.get("data") or {}).get("klines") or []:
        fields = line.split(",")
        if len(fields) >= 5:
            result.append({"date": fields[0], "close": number(fields[2]), "turnoverYi": round(number(fields[4]) / 100_000_000, 2)})
    return result


def secucode(code: str) -> str:
    return f"{code}.SH" if code.startswith(("5", "6", "9")) else f"{code}.BJ" if code.startswith(("4", "8")) else f"{code}.SZ"


def financial(code: str) -> list[dict]:
    payload = get_json("https://datacenter.eastmoney.com/securities/api/data/get", {
        "type": "RPT_F10_FINANCE_MAINFINADATA", "sty": "APP_F10_MAINFINADATA",
        "filter": f'(SECUCODE="{secucode(code)}")', "p": 1, "ps": 20,
        "sr": -1, "st": "REPORT_DATE", "source": "HSF10", "client": "PC",
    })
    rows = ((payload.get("result") or {}).get("data") or [])
    return [{"code": code, "reportDate": str(row.get("REPORT_DATE") or "")[:10],
             "revenueGrowth": row.get("TOTALOPERATEREVETZ"), "profitGrowth": row.get("PARENTNETPROFITTZ"),
             "cashToRevenue": row.get("JYXJLYYSR")} for row in rows if row.get("REPORT_DATE")]


def finite_values(values):
    return [float(value) for value in values if isinstance(value, (int, float)) and math.isfinite(value)]


def number(value) -> float:
    try:
        result = float(value)
        return result if math.isfinite(result) else 0.0
    except (TypeError, ValueError):
        return 0.0


def build_item(theme_id: str, query: str, board: str, capacity: dict, demand_sources: list[dict] | None = None) -> dict:
    rows = constituents(board)
    total_float = sum(number(row.get("f21")) for row in rows)
    total_market = sum(number(row.get("f20")) for row in rows)
    turnover = sum(number(row.get("f6")) for row in rows)
    shares = sorted((number(row.get("f21")) / total_float for row in rows if total_float), reverse=True)
    top = sorted(rows, key=lambda row: number(row.get("f21")), reverse=True)[:10]
    reports_by_company = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(financial, row["f12"]): row for row in top if row.get("f12")}
        for future in as_completed(futures):
            try:
                values = future.result()
                if values:
                    reports_by_company.append(values)
            except Exception:
                pass
    report_dates = sorted({item["reportDate"] for reports in reports_by_company for item in reports}, reverse=True)
    latest_date = report_dates[0] if report_dates else None
    reports = [item for company in reports_by_company for item in company if item["reportDate"] == latest_date]
    revenue = finite_values(item.get("revenueGrowth") for item in reports)
    profit = finite_values(item.get("profitGrowth") for item in reports)
    cash = finite_values(item.get("cashToRevenue") for item in reports)
    enterprise_history = []
    for report_date in report_dates[:12]:
        period = [item for company in reports_by_company for item in company if item["reportDate"] == report_date]
        period_revenue = finite_values(item.get("revenueGrowth") for item in period)
        period_profit = finite_values(item.get("profitGrowth") for item in period)
        period_cash = finite_values(item.get("cashToRevenue") for item in period)
        if period_revenue or period_profit:
            enterprise_history.append({"reportDate": report_date, "sampleCompanies": len(period),
                "revenueGrowthMedian": round(median(period_revenue), 1) if period_revenue else None,
                "positiveRevenueShare": round(sum(value > 0 for value in period_revenue) / len(period_revenue) * 100, 1) if period_revenue else None,
                "profitGrowthMedian": round(median(period_profit), 1) if period_profit else None,
                "positiveProfitShare": round(sum(value > 0 for value in period_profit) / len(period_profit) * 100, 1) if period_profit else None,
                "cashToRevenueMedian": round(median(period_cash), 1) if period_cash else None})
    try:
        market_history = board_history(board)
    except Exception:
        market_history = []
    contract = STRUCTURE_CONTRACTS[theme_id]
    try:
        structure_series = structure_history(theme_id)
    except Exception:
        structure_series = {"history": [], "status": "获取失败"}
    if not structure_series.get("history"):
        try:
            structure_series["catalysts"] = cninfo_catalysts(query)
            structure_series["catalystStatus"] = "已更新"
        except Exception:
            structure_series["catalysts"] = []
            structure_series["catalystStatus"] = "本次采集失败"
        structure_series["catalystWindowDays"] = 120
        structure_series["catalystSource"] = "巨潮资讯上市公司公告"
    return {
        "id": theme_id,
        "structure": {"signal": contract[0], "metrics": contract[1], "source": contract[2],
                      **structure_series, "demandAssessment": demand_assessment(contract, structure_series, demand_sources),
                      "historyPoints": len(structure_series.get("history") or []),
                      "note": "核心需求使用多指标合同；单一产量或供给指标只作为低权重辅助证据。"},
        "enterprise": {"sampleCompanies": len(top), "reportedCompanies": len(reports),
                       "coveragePercent": round(sum(number(row.get("f21")) for row in top) / total_float * 100, 1) if total_float else 0,
                       "reportDate": latest_date,
                       "revenueGrowthMedian": round(median(revenue), 1) if revenue else None,
                       "positiveRevenueShare": round(sum(value > 0 for value in revenue) / len(revenue) * 100, 1) if revenue else None,
                       "profitGrowthMedian": round(median(profit), 1) if profit else None,
                       "positiveProfitShare": round(sum(value > 0 for value in profit) / len(profit) * 100, 1) if profit else None,
                       "cashToRevenueMedian": round(median(cash), 1) if cash else None,
                       "source": "东方财富上市公司财务报告", "status": "真实公开数据" if reports else "获取失败",
                       "history": enterprise_history,
                       "note": "按板块流通市值前10家公司汇总；显示样本覆盖率，不以PE替代兑现。"},
        "assets": {"boardCode": board, "boardName": capacity.get("boardName") or query,
                   "constituentCount": len(rows), "liquidConstituentCount": sum(number(row.get("f6")) >= 100_000_000 for row in rows),
                   "dailyTurnoverYi": round(turnover / 100_000_000, 1),
                   "totalMarketCapYi": round(total_market / 100_000_000, 1),
                   "floatMarketCapYi": round(total_float / 100_000_000, 1),
                   "top10SharePercent": round(sum(shares[:10]) * 100, 1) if shares else None,
                   "hhi": round(sum(share * share for share in shares) * 10000, 1) if shares else None,
                   "topConstituents": [{"rank": index + 1, "code": row.get("f12"), "name": row.get("f14"),
                        "floatMarketCapYi": round(number(row.get("f21")) / 100_000_000, 1),
                        "dailyTurnoverYi": round(number(row.get("f6")) / 100_000_000, 2),
                        "weightPercent": round(number(row.get("f21")) / total_float * 100, 2) if total_float else None}
                        for index, row in enumerate(top)],
                   "marketHistory": market_history,
                   "source": "东方财富公开板块成分与行情", "status": "真实公开数据" if rows else "获取失败"},
    }


def main() -> None:
    attention = json.loads(ATTENTION.read_text(encoding="utf-8"))
    capacities = {item["id"]: item.get("capacity") or {} for item in attention.get("items", [])}
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    previous_map = {item["id"]: item for item in previous.get("items", [])}
    demand_payload = json.loads(DEMAND_SOURCES.read_text(encoding="utf-8")) if DEMAND_SOURCES.exists() else {"sources": []}
    demand_by_theme = {}
    for source in demand_payload.get("sources", []):
        demand_by_theme.setdefault(source.get("themeId"), []).append(source)
    items = []
    for theme_id, query, board in THEMES:
        print(f"fetching {theme_id} ({len(items) + 1}/36)...", flush=True)
        try:
            items.append(build_item(theme_id, query, board, capacities.get(theme_id, {}), demand_by_theme.get(theme_id, [])))
        except Exception as exc:
            fallback = previous_map.get(theme_id, {"id": theme_id})
            fallback["error"] = type(exc).__name__
            items.append(fallback)
        time.sleep(.5)
    now = datetime.now().astimezone().isoformat()
    today = date.today().isoformat()
    for item in items:
        old = previous_map.get(item["id"], {})
        asset = item.get("assets") or {}
        if not asset.get("marketHistory"):
            asset["marketHistory"] = (old.get("assets") or {}).get("marketHistory") or []
        asset_point = {"date": today, "constituentCount": asset.get("constituentCount"),
                       "floatMarketCapYi": asset.get("floatMarketCapYi"), "dailyTurnoverYi": asset.get("dailyTurnoverYi"),
                       "top10SharePercent": asset.get("top10SharePercent"), "hhi": asset.get("hhi")}
        asset_history = [point for point in (old.get("assets") or {}).get("history", []) if point.get("date") != today]
        asset["history"] = (asset_history + [asset_point])[-1095:]
        enterprise = item.get("enterprise") or {}
        report_date = enterprise.get("reportDate")
        enterprise_point = {"reportDate": report_date, "revenueGrowthMedian": enterprise.get("revenueGrowthMedian"),
                            "profitGrowthMedian": enterprise.get("profitGrowthMedian"),
                            "positiveRevenueShare": enterprise.get("positiveRevenueShare"),
                            "positiveProfitShare": enterprise.get("positiveProfitShare"),
                            "coveragePercent": enterprise.get("coveragePercent")}
        history_by_period = {point.get("reportDate"): point for point in (old.get("enterprise") or {}).get("history", []) if point.get("reportDate")}
        history_by_period.update({point.get("reportDate"): point for point in enterprise.get("history", []) if point.get("reportDate")})
        if report_date:
            history_by_period[report_date] = {**history_by_period.get(report_date, {}), **enterprise_point}
        enterprise["history"] = [history_by_period[key] for key in sorted(history_by_period, reverse=True)[:20]]
        structure = item.get("structure") or {}
        old_structure = old.get("structure") or {}
        structure["catalystHistory"] = merge_catalyst_history(old_structure, structure)
        structure["catalystHistoryDays"] = 1095
        if not structure.get("history"):
            structure["history"] = old_structure.get("history") or []
            if structure["history"]:
                structure.update({key: old_structure.get(key) for key in ("metric", "unit", "source", "sourceUrl", "status") if old_structure.get(key)})
        structure["historyPoints"] = len(structure.get("history") or [])
        contract = STRUCTURE_CONTRACTS[item["id"]]
        structure["demandAssessment"] = demand_assessment(contract, structure, demand_by_theme.get(item["id"], []))
    output = {"schemaVersion": 3, "updateTime": now, "methodologyVersion": "multi-signal-demand-36-v1",
              "universeCount": 36, "coveredCount": sum(not item.get("error") for item in items),
              "enterpriseDataCount": sum(len((item.get("enterprise") or {}).get("history") or []) >= 4 for item in items),
              "assetDataCount": sum(len((item.get("assets") or {}).get("topConstituents") or []) == min(10, (item.get("assets") or {}).get("constituentCount") or 0) for item in items),
              "assetMarketHistoryCount": sum(len((item.get("assets") or {}).get("marketHistory") or []) >= 200 for item in items),
              "structureDataCount": sum(len((item.get("structure") or {}).get("history") or []) >= 4 for item in items),
              "items": items}
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT}: {len(items)}/36 contracts, enterprise={output['enterpriseDataCount']}, assets={output['assetDataCount']}")


def refresh_catalysts() -> None:
    payload = json.loads(OUT.read_text(encoding="utf-8"))
    queries = {theme_id: query for theme_id, query, _ in THEMES}
    for item in payload.get("items", []):
        structure = item.get("structure") or {}
        if structure.get("history"):
            continue
        try:
            structure["catalysts"] = cninfo_catalysts(queries[item["id"]])
            structure["catalystStatus"] = "已更新"
        except Exception:
            structure["catalystStatus"] = "本次采集失败"
        structure["catalystWindowDays"] = 120
        structure["catalystSource"] = "巨潮资讯上市公司公告"
        structure["catalystHistory"] = merge_catalyst_history(structure, structure)
        structure["catalystHistoryDays"] = 1095
        time.sleep(.7)
    payload["updateTime"] = datetime.now().astimezone().isoformat()
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print("refreshed catalyst events")


if __name__ == "__main__":
    refresh_catalysts() if "--catalysts-only" in sys.argv else main()
