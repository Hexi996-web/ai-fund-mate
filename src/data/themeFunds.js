export const normalizeFundCode = (value) => {
  if (value === null || value === undefined) return null
  const code = String(value).trim()
  return code ? code.padStart(6, '0') : null
}

export const classifyBondFund = (fund = {}) => {
  const text = `${fund.name ?? ''} ${fund.type ?? ''}`.toLowerCase()
  if (text.includes('可转债') || text.includes('转债')) return '可转债'
  if (text.includes('债券etf') || (text.includes('债券') && text.includes('etf'))) return '债券ETF'
  if (text.includes('短债')) return '短债'
  if (text.includes('纯债')) return '纯债'
  if (text.includes('二级债') || text.includes('混合债')) return '混合债'
  return '其他债券基金'
}

const completeness = (fund) => ['name', 'type', 'return1y', 'scale', 'establishedAt'].filter((key) => fund?.[key] !== null && fund?.[key] !== undefined && fund?.[key] !== '').length

const buildAnalysis = (link, fund) => {
  const match = link.review_status === 'reviewed' ? '人工审核映射' : '规则自动匹配，待人工复核'
  const missing = fund ? '' : '；基金名称和指标暂无公开数据'
  return `${match}，匹配依据：${link.matched_rule ?? '未提供'}${missing}。仅用于产品研究，不构成投资建议。`
}

export const joinThemeFunds = (links = [], fundPayload = {}, { limit = 5 } = {}) => {
  const fundMap = new Map((fundPayload?.funds ?? []).map((fund) => [normalizeFundCode(fund.code), fund]))
  const groups = new Map()
  for (const link of links) {
    const code = normalizeFundCode(link.fund_code)
    if (!code || !link.theme) continue
    const fund = fundMap.get(code)
    const item = {
      code,
      name: fund?.name ?? '暂无公开数据',
      type: fund?.type ?? '暂无公开数据',
      matchType: link.match_type,
      confidence: Number(link.confidence ?? 0),
      reviewStatus: link.review_status ?? 'auto',
      matchedRule: link.matched_rule ?? '未提供',
      bondCategory: link.theme === 'bond' ? classifyBondFund(fund) : null,
      analysis: buildAnalysis(link, fund),
      metrics: {
        return1y: fund?.return1y ?? fund?.yearReturn ?? null,
        scale: fund?.scale ?? null,
        establishedAt: fund?.establishedAt ?? fund?.establishDate ?? null,
      },
      completeness: completeness(fund),
    }
    if (!groups.has(link.theme)) groups.set(link.theme, [])
    groups.get(link.theme).push(item)
  }
  const result = new Map()
  for (const [theme, items] of groups) {
    const all = items.toSorted((a, b) => Number(b.reviewStatus === 'reviewed') - Number(a.reviewStatus === 'reviewed') || b.confidence - a.confidence || b.completeness - a.completeness || a.code.localeCompare(b.code))
    result.set(theme, { featured: all.slice(0, limit), all, unavailableReason: null })
  }
  return result
}
