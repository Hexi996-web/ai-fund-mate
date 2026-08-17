const IMPORTANCE_ORDER = { high: 3, medium: 2, low: 1 }
const EVIDENCE_ORDER = { official: 4, public: 3, proxy: 2, demo: 1 }

export const filterSignals = (signals, filters) => signals.filter((signal) => (
  (filters.category === 'all' || signal.category === filters.category)
  && (filters.importance === 'all' || signal.importance === filters.importance)
  && (filters.evidenceType === 'all' || signal.evidenceType === filters.evidenceType)
  && (!filters.demandKind || filters.demandKind === 'all' || signal.demandKind === filters.demandKind)
))

export const normalizeLiveSignal = (signal) => {
  const primary = signal.sources?.[0]
  const host = primary?.url ? new URL(primary.url).hostname.replace(/^www\./, '') : '未知来源'
  const importance = signal.priority >= 70 ? 'high' : signal.priority >= 40 ? 'medium' : 'low'
  const evidenceType = signal.validationStatus === 'confirmed' && signal.sourceConfidence >= .8 ? 'official' : signal.demandKind === 'proxy' ? 'proxy' : 'public'
  return {
    ...signal, importance, evidenceType,
    observedAt: signal.updatedAt?.slice(0, 10),
    sourceName: host, sourceUrl: primary?.url ?? '', sourceNote: primary?.excerpt || '公开信源，请查看原文核验。',
    sources: signal.sources ?? [],
    fact: signal.summary || signal.title,
    interpretation: '该信号已按来源可信度、客户需求证据和时效性评分，需结合产品定位进一步研判。',
    transmission: ['公开事件', '资产配置预期变化', '公募产品需求或风险变化'],
    affectedAssets: [signal.category === 'customer' ? '客户需求' : '相关资产'], relatedFundKeywords: [signal.category],
    counterEvidence: ['需要后续数据和独立来源交叉验证。'], invalidationConditions: ['后续官方口径或实际客户数据不支持。'],
    recommendedAction: signal.demandKind === 'direct' ? '纳入高优先级产品需求验证。' : '保持跟踪，补充官方或真实客户证据。',
  }
}

export const sortSignals = (signals) => [...signals].sort((left, right) => (
  (IMPORTANCE_ORDER[right.importance] ?? 0) - (IMPORTANCE_ORDER[left.importance] ?? 0)
  || (EVIDENCE_ORDER[right.evidenceType] ?? 0) - (EVIDENCE_ORDER[left.evidenceType] ?? 0)
  || String(right.observedAt ?? '').localeCompare(String(left.observedAt ?? ''))
))

const localDate = (value) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const isSignalStale = (signal, now = new Date()) => (
  Boolean(signal.validThrough) && signal.validThrough < localDate(now)
)

export const getThemeEvidence = (theme, signals) => {
  const byId = new Map(signals.map((signal) => [signal.id, signal]))
  const supporting = (theme.signalIds ?? []).map((id) => byId.get(id)).filter(Boolean)
  const counter = (theme.counterSignalIds ?? []).map((id) => byId.get(id)).filter(Boolean)
  return {
    supporting,
    counter,
    isComplete: supporting.length > 0 && (counter.length > 0 || Boolean(theme.invalidationCondition)),
  }
}

export const getSignalSummary = (signals, now = new Date()) => ({
  total: signals.length,
  highImportance: signals.filter(({ importance }) => importance === 'high').length,
  official: signals.filter(({ evidenceType }) => evidenceType === 'official').length,
  proxyOrDemo: signals.filter(({ evidenceType }) => ['proxy', 'demo'].includes(evidenceType)).length,
  topSignal: sortSignals(signals.filter((signal) => !isSignalStale(signal, now)))[0] ?? null,
})
