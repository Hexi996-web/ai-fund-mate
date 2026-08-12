const RULE_TEXT = {
  'no current observation': '当前没有可用观测值，本项暂不计分。',
  'single snapshot confirms availability only; trend unavailable': '当前仅有单期数据，只能确认指标可用，暂不能据此判断趋势。',
  'valid official policy metadata; no directional inference': '已取得有效的官方政策信息，但单份政策不能直接推导市场方向。',
  'inverse fund-share crowding bands: <50, <250, <1000, >=1000': '根据相关基金产品数量评估产品供给拥挤度；产品越集中，新增产品的差异化空间越值得关注。',
}

const INDICATOR_NAMES = {
  central_bank_gold: '央行黄金储备', gold_price_cny: '人民币黄金价格', domestic_gold_etf_share: '境内黄金ETF份额', usd_cny_gold: '美元兑人民币汇率', us_real_yield_10y: '美国10年期实际利率',
  integrated_circuit_output: '集成电路产量', semiconductor_sales: '全球半导体销售额', semiconductor_index: '半导体指数', semiconductor_etf_share: '半导体ETF份额',
  dividend_yield: '红利指数股息率', dividend_etf_share: '红利ETF份额', cn_govt_yield_10y_dividend: '中国10年期国债收益率', dividend_index: '红利指数点位',
  social_financing: '社会融资规模', m1_m2: '货币供应量指标', repo_rate: '资金回购利率', cn_yield_curve: '中国国债收益率曲线',
  hstech_valuation: '恒生科技指数估值', usd_cny_hk: '美元兑人民币汇率', hstech_etf_share: '恒生科技ETF份额', southbound_turnover: '南向资金成交净额', hstech_index: '恒生科技指数点位',
  linkedFundShares: '相关基金产品数量',
}

const IMPACT_TEXT = {
  us_real_yield_10y: '黄金机会判断缺少实际利率这一关键定价变量，估值与宏观交叉验证能力下降。',
  integrated_circuit_output: 'AI与半导体主题缺少产业产量验证，基本面判断可信度下降。',
  semiconductor_sales: 'AI与半导体主题缺少行业销售景气验证，基本面判断可信度下降。',
  semiconductor_index: 'AI与半导体主题缺少指数行情数据，估值维度暂不计分。',
  dividend_yield: '红利基金缺少股息率数据，估值判断主要依赖指数点位和国债收益率。',
  social_financing: '债券基金缺少社会融资数据，信用与流动性环境的交叉验证不完整。',
  hstech_valuation: '港股科技缺少指数估值数据，当前估值判断的完整性下降。',
}

export const localizeRule = (rule) => RULE_TEXT[rule] ?? '当前规则说明尚未完成中文适配，请结合已列示数据审慎判断。'

export const localizeEvidence = (value) => {
  const match = /^([A-Za-z0-9_]+)=(.*?) \((\d{4}-\d{2}-\d{2})\)$/.exec(String(value))
  if (!match) return String(value)
  const [, code, observation, date] = match
  return `${INDICATOR_NAMES[code] ?? '相关研究指标'}：${observation}（${date}）`
}

export const explainGap = (value) => {
  const [code, status] = String(value).split('=')
  const reason = status === 'parse_failed' ? '公开数据已经取得，但解析失败，暂未形成有效观测值。' : '公开数据源暂不可用，当前未取得有效观测值。'
  return {
    title: INDICATOR_NAMES[code] ?? '相关研究指标',
    reason,
    impact: IMPACT_TEXT[code] ?? '该指标暂未参与当前评分，主题结论的完整性相应降低。',
  }
}
