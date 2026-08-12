def _date(value):
    return value.strftime("%Y-%m-%d") if hasattr(value,"strftime") else str(value)[:10]

def normalize_fx(frame):
    row=frame.sort_values("日期").iloc[-1]
    value=round(float(row["央行中间价"])/100,4)
    common={"date":_date(row["日期"]),"value":value,"unit":"人民币/美元","dimension":"央行中间价","source_id":"akshare","upstream":"中国银行/中国人民银行"}
    return [{"indicator_id":"usd_cny_gold",**common},{"indicator_id":"usd_cny_hk",**common}]

def normalize_southbound(frame):
    rows=frame[frame["资金方向"]=="南向"]
    latest=rows["交易日"].max(); rows=rows[rows["交易日"]==latest]
    return [{"indicator_id":"southbound_turnover","date":_date(latest),"value":round(float(rows["成交净买额"].sum()),6),"unit":"亿元","dimension":"南向成交净买额","source_id":"akshare","upstream":"沪深港通公开数据"}]

def policy_documents():
    return [
      {"theme":"ai_semiconductor","title":"促进资本市场指数化投资高质量发展行动方案","source_name":"中国证监会","source_url":"https://www.csrc.gov.cn/csrc/c100028/c7536076/content.shtml","published_at":"2025-01-26","quality_status":"normal"},
      {"theme":"dividend","title":"国务院关于加强监管防范风险推动资本市场高质量发展的若干意见","source_name":"中国政府网","source_url":"https://www.gov.cn/zhengce/content/202404/content_6944877.htm","published_at":"2024-04-12","quality_status":"normal"},
      {"theme":"bond","title":"中国人民银行货币政策信息入口","source_name":"中国人民银行","source_url":"https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/index.html","published_at":None,"quality_status":"human_confirmed"},
      {"theme":"hong_kong_tech","title":"推动公募基金高质量发展行动方案","source_name":"中国证监会","source_url":"https://www.csrc.gov.cn/","published_at":"2025-05-07","quality_status":"human_confirmed"},
      {"theme":"gold","title":"黄金市场运行信息入口","source_name":"上海黄金交易所","source_url":"https://www.sge.com.cn/sjzx/mrhq","published_at":None,"quality_status":"human_confirmed"}
    ]
