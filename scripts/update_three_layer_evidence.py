"""Build three-layer evidence for every direction in the 36-theme mother pool.

Free public data is intentionally separated by what it can prove:
- structure: a theme-specific metric contract (no score until official history exists);
- enterprise: revenue/profit/cash-flow breadth for the largest constituents;
- assets: full constituent count, liquidity and concentration.
"""
from __future__ import annotations

import json
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
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
    "inbound-consumption": ("入境消费恢复", ["入境人次", "国际航班量", "入境游客消费"], "文旅部／民航局"),
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


def get_json(url: str, params: dict) -> dict:
    response = requests.get(url, params=params, headers=HEADERS, timeout=40)
    response.raise_for_status()
    return response.json()


def constituents(board: str) -> list[dict]:
    payload = get_json("https://push2delay.eastmoney.com/api/qt/clist/get", {
        "pn": 1, "pz": 500, "po": 1, "np": 1, "fltt": 2, "invt": 2,
        "fid": "f20", "fs": f"b:{board}", "fields": "f12,f14,f6,f20,f21",
    })
    return (payload.get("data") or {}).get("diff") or []


def secucode(code: str) -> str:
    return f"{code}.SH" if code.startswith(("5", "6", "9")) else f"{code}.BJ" if code.startswith(("4", "8")) else f"{code}.SZ"


def financial(code: str) -> dict | None:
    payload = get_json("https://datacenter.eastmoney.com/securities/api/data/get", {
        "type": "RPT_F10_FINANCE_MAINFINADATA", "sty": "APP_F10_MAINFINADATA",
        "filter": f'(SECUCODE="{secucode(code)}")', "p": 1, "ps": 8,
        "sr": -1, "st": "REPORT_DATE", "source": "HSF10", "client": "PC",
    })
    rows = ((payload.get("result") or {}).get("data") or [])
    if not rows:
        return None
    row = rows[0]
    return {"code": code, "reportDate": str(row.get("REPORT_DATE") or "")[:10],
            "revenueGrowth": row.get("TOTALOPERATEREVETZ"), "profitGrowth": row.get("PARENTNETPROFITTZ"),
            "cashToRevenue": row.get("JYXJLYYSR")}


def finite_values(values):
    return [float(value) for value in values if isinstance(value, (int, float)) and math.isfinite(value)]


def number(value) -> float:
    try:
        result = float(value)
        return result if math.isfinite(result) else 0.0
    except (TypeError, ValueError):
        return 0.0


def build_item(theme_id: str, query: str, board: str, capacity: dict) -> dict:
    rows = constituents(board)
    total_float = sum(number(row.get("f21")) for row in rows)
    total_market = sum(number(row.get("f20")) for row in rows)
    turnover = sum(number(row.get("f6")) for row in rows)
    shares = sorted((number(row.get("f21")) / total_float for row in rows if total_float), reverse=True)
    top = rows[:10]
    reports = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(financial, row["f12"]): row for row in top if row.get("f12")}
        for future in as_completed(futures):
            try:
                value = future.result()
                if value:
                    reports.append(value)
            except Exception:
                pass
    revenue = finite_values(item.get("revenueGrowth") for item in reports)
    profit = finite_values(item.get("profitGrowth") for item in reports)
    cash = finite_values(item.get("cashToRevenue") for item in reports)
    report_dates = sorted((item["reportDate"] for item in reports if item.get("reportDate")), reverse=True)
    contract = STRUCTURE_CONTRACTS[theme_id]
    return {
        "id": theme_id,
        "structure": {"signal": contract[0], "metrics": contract[1], "source": contract[2],
                      "status": "指标合同已建立", "historyPoints": 0,
                      "note": "结构层不以行情代理；官方同口径历史未达到4期前不形成趋势分。"},
        "enterprise": {"sampleCompanies": len(top), "reportedCompanies": len(reports),
                       "coveragePercent": round(sum(number(row.get("f21")) for row in top) / total_float * 100, 1) if total_float else 0,
                       "reportDate": report_dates[0] if report_dates else None,
                       "revenueGrowthMedian": round(median(revenue), 1) if revenue else None,
                       "positiveRevenueShare": round(sum(value > 0 for value in revenue) / len(revenue) * 100, 1) if revenue else None,
                       "profitGrowthMedian": round(median(profit), 1) if profit else None,
                       "positiveProfitShare": round(sum(value > 0 for value in profit) / len(profit) * 100, 1) if profit else None,
                       "cashToRevenueMedian": round(median(cash), 1) if cash else None,
                       "source": "东方财富上市公司财务报告", "status": "真实公开数据" if reports else "获取失败",
                       "note": "按板块流通市值前10家公司汇总；显示样本覆盖率，不以PE替代兑现。"},
        "assets": {"boardCode": board, "boardName": capacity.get("boardName") or query,
                   "constituentCount": len(rows), "liquidConstituentCount": sum(number(row.get("f6")) >= 100_000_000 for row in rows),
                   "dailyTurnoverYi": round(turnover / 100_000_000, 1),
                   "totalMarketCapYi": round(total_market / 100_000_000, 1),
                   "floatMarketCapYi": round(total_float / 100_000_000, 1),
                   "top10SharePercent": round(sum(shares[:10]) * 100, 1) if shares else None,
                   "hhi": round(sum(share * share for share in shares) * 10000, 1) if shares else None,
                   "source": "东方财富公开板块成分与行情", "status": "真实公开数据" if rows else "获取失败"},
    }


def main() -> None:
    attention = json.loads(ATTENTION.read_text(encoding="utf-8"))
    capacities = {item["id"]: item.get("capacity") or {} for item in attention.get("items", [])}
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    previous_map = {item["id"]: item for item in previous.get("items", [])}
    items = []
    for theme_id, query, board in THEMES:
        try:
            items.append(build_item(theme_id, query, board, capacities.get(theme_id, {})))
        except Exception as exc:
            fallback = previous_map.get(theme_id, {"id": theme_id})
            fallback["error"] = type(exc).__name__
            items.append(fallback)
    now = datetime.now().astimezone().isoformat()
    today = date.today().isoformat()
    for item in items:
        old = previous_map.get(item["id"], {})
        asset = item.get("assets") or {}
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
        enterprise_history = [point for point in (old.get("enterprise") or {}).get("history", []) if point.get("reportDate") != report_date]
        enterprise["history"] = (enterprise_history + ([enterprise_point] if report_date else []))[-20:]
        item["structure"]["historyPoints"] = len((old.get("structure") or {}).get("history", []))
    output = {"schemaVersion": 2, "updateTime": now, "methodologyVersion": "three-layer-36-v1",
              "universeCount": 36, "coveredCount": len(items),
              "enterpriseDataCount": sum((item.get("enterprise") or {}).get("status") == "真实公开数据" for item in items),
              "assetDataCount": sum((item.get("assets") or {}).get("status") == "真实公开数据" for item in items),
              "items": items}
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT}: {len(items)}/36 contracts, enterprise={output['enterpriseDataCount']}, assets={output['assetDataCount']}")


if __name__ == "__main__":
    main()
