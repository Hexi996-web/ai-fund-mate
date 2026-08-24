const DEFINITIONS = [
  { id: 'broad', name: '宽基指数', range: '约 5%—15%', test: (p) => /沪深300|中证500|中证1000|上证50|创业板|科创50|A500|宽基/.test(p.productName) },
  { id: 'tech', name: '科技/通信/半导体', range: '约 15%—35%', test: (p) => /科技|通信|半导体|芯片|人工智能|软件|电子|机器人|计算机/.test(p.productName) },
  { id: 'active', name: '主动混合', range: '约 -10%—30%', test: (p) => p.type?.startsWith('混合型') && !/指数/.test(p.type) },
  { id: 'qdii', name: '港股科技/QDII', range: '约 5%—25%', test: (p) => p.type?.startsWith('QDII') || /港股|恒生科技|纳斯达克|标普/.test(p.productName) },
  { id: 'gold', name: '黄金与资源', range: '约 -10%—20%', test: (p) => /黄金|有色|资源|原油|石油|煤炭|稀土/.test(p.productName) },
  { id: 'health', name: '医药与消费', range: '约 0%—15%', test: (p) => /医药|医疗|创新药|消费|食品|白酒|家电/.test(p.productName) },
  { id: 'bond', name: '债券基金', range: '约 2%—5%', test: (p) => p.type?.startsWith('债券型') },
  { id: 'money', name: '货币基金', range: '约 1%—2%', test: (p) => p.type?.startsWith('货币型') },
  { id: 'fof', name: 'FOF', range: '约 2%—8%', test: (p) => p.type?.startsWith('FOF') },
]

const finite = (value) => Number.isFinite(value)
const median = (values) => {
  const sorted = values.filter(finite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const sum = (values) => values.filter(finite).reduce((total, value) => total + value, 0)
const comparableReturn = (product, dataDate) => {
  if (product.type?.startsWith('货币型') || !finite(product.navGrowthPercent)) return false
  const year = String(dataDate || '').slice(0, 4)
  return Boolean(year && product.metricsCoverageStart && product.metricsCoverageStart <= `${year}-01-07`)
}

const judgement = (row) => {
  if (!finite(row.navMedian)) return '样本待补充'
  if (row.navMedian >= 15) return '强势主线，高波动'
  if (row.navMedian >= 6) return '偏强运行'
  if (row.navMedian >= 1) return '温和修复'
  if (row.navMedian >= -3) return '区间震荡'
  return '承压分化'
}

export function buildMarketForecast(payload) {
  const products = payload?.products ?? []
  const dataDate = payload?.dataDate ?? payload?.updateTime?.slice(0, 10) ?? '--'
  const rows = DEFINITIONS.map((definition) => {
    const funds = products.filter(definition.test)
    const returnFunds = funds.filter((product) => comparableReturn(product, dataDate))
    const daily = funds.map((p) => p.representativeShare?.dailyChangePercent ?? p.shares?.[0]?.dailyChangePercent).filter(finite)
    const row = {
      ...definition,
      funds,
      observed: daily.length,
      navMedian: median(returnFunds.map((p) => p.navGrowthPercent)),
      drawdownMedian: median(returnFunds.map((p) => p.maxDrawdownPercent)),
      returnSampleCount: returnFunds.length,
      scaleNetIncrease: sum(funds.map((p) => p.scaleNetIncreaseYi)),
      upBreadth: daily.length ? daily.filter((value) => value > 0).length / daily.length * 100 : null,
    }
    return { ...row, judgement: judgement(row) }
  })
  const ranked = [...rows].filter((row) => finite(row.navMedian)).sort((a, b) => b.navMedian - a.navMedian)
  const inflow = [...rows].sort((a, b) => b.scaleNetIncrease - a.scaleNetIncrease)
  const risk = [...rows].filter((row) => finite(row.drawdownMedian)).sort((a, b) => a.drawdownMedian - b.drawdownMedian)
  const equityRows = rows.filter((row) => ['broad', 'tech', 'active', 'qdii', 'gold', 'health'].includes(row.id))
  const defensiveRows = rows.filter((row) => ['bond', 'money', 'fof'].includes(row.id))
  const equityReturn = median(equityRows.map((row) => row.navMedian))
  const equityFlow = sum(equityRows.map((row) => row.scaleNetIncrease))
  const defensiveFlow = sum(defensiveRows.map((row) => row.scaleNetIncrease))
  const returnRows = rows.filter((row) => finite(row.navMedian))
  const positiveReturnBreadth = returnRows.length ? returnRows.filter((row) => row.navMedian > 0).length / returnRows.length * 100 : null
  const positiveFlowBreadth = rows.length ? rows.filter((row) => row.scaleNetIncrease > 0).length / rows.length * 100 : null
  const dispersion = ranked.length > 1 ? ranked[0].navMedian - ranked.at(-1).navMedian : null
  let regime = '高分化震荡'
  let interpretation = '类别收益差异较大，产品选择的重要性高于简单方向配置。'
  let action = '优先保留收益和资金流同时占优的工具，避免依据单一冠军追高。'
  if ((positiveReturnBreadth ?? 0) >= 70 && equityFlow > 0) {
    regime = '风险偏好扩散'
    interpretation = '多数分类收益中枢为正，且权益方向获得规模增量，行情正在由局部向更广范围扩散。'
    action = '可适度增加宽基与景气主线供给，但继续用回撤约束主题产品仓位。'
  } else if ((equityReturn ?? 0) > 0 && defensiveFlow > equityFlow) {
    regime = '结构进攻、固收防守'
    interpretation = '权益收益保持正向，但新增资金更多停留在债券、货币与FOF，风险偏好尚未全面转强。'
    action = '产品布局宜维持权益工具与稳健底仓两端配置，不宜把主题上涨外推为全面牛市。'
  } else if ((equityReturn ?? 0) <= 0 && defensiveFlow > 0) {
    regime = '防御占优'
    interpretation = '权益收益中枢偏弱，增量资金向低波动产品集中，市场风险偏好处于收缩阶段。'
    action = '控制高波动新品节奏，优先现金管理、短久期及低波动配置工具。'
  }
  return {
    dataDate,
    rows,
    leaders: { return: ranked[0], inflow: inflow[0], risk: risk[0] },
    baseline: {
      regime, interpretation, action,
      equityReturn, equityFlow, defensiveFlow,
      positiveReturnBreadth, positiveFlowBreadth, dispersion,
      invalidation: regime === '结构进攻、固收防守'
        ? '若权益资金净增额持续超过稳健资产、且正收益分类占比升至70%以上，基准判断将上调为风险偏好扩散。'
        : '若正收益分类占比跌破50%，同时回撤压力继续加深，当前判断将转向防御。',
    },
  }
}
