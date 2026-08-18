const RULES = [
  ['科创与芯片', /科创|芯片|半导体|集成电路/], ['AI与机器人', /AI|人工智能|机器人|算力|软件/i],
  ['新能源与电池', /新能源|电池|光伏|储能|风电/], ['医药与创新药', /医药|医疗|创新药|生物科技/],
  ['消费', /消费|食品|酒|家电|旅游/], ['红利与低波', /红利|低波|高股息|现金流/],
  ['港股科技', /港股.*科技|恒生科技|互联网/], ['黄金与有色', /黄金|有色|稀土|资源/],
  ['军工与高端制造', /军工|高端装备|航天|国防/], ['金融', /证券|银行|保险|金融/],
  ['周期与化工', /周期|化工|钢铁|煤炭/], ['短债', /短债|中短债/],
  ['可转债', /可转债|转债/], ['海外科技', /纳斯达克|标普|美国.*科技/],
]

export function buildHotSectors(payload, limit = 8) {
  const groups = new Map(RULES.map(([name]) => [name, []]))
  for (const product of payload?.products ?? []) {
    const text = `${product.productName} ${product.type}`
    const rule = RULES.find(([, pattern]) => pattern.test(text))
    if (!rule) continue
    const share = product.shares?.find((item) => Number.isFinite(item.dailyChangePercent)) ?? product.shares?.[0]
    groups.get(rule[0]).push({ ...product, dailyChangePercent: share?.dailyChangePercent ?? null, purchaseStatus: share?.purchaseStatus ?? '待补全' })
  }
  return [...groups].map(([name, funds]) => {
    const observed = funds.filter((fund) => Number.isFinite(fund.dailyChangePercent))
    const avgReturn = observed.length ? observed.reduce((sum, fund) => sum + fund.dailyChangePercent, 0) / observed.length : 0
    const upBreadth = observed.length ? observed.filter((fund) => fund.dailyChangePercent > 0).length / observed.length * 100 : 0
    const heat = Math.max(0, Math.min(100, 50 + avgReturn * 12 + (upBreadth - 50) * .45))
    return { name, funds, observed: observed.length, avgReturn, upBreadth, heat }
  }).filter((sector) => sector.observed >= 5).sort((a, b) => b.heat - a.heat).slice(0, limit)
}
