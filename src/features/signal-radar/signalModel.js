const IMPORTANCE_ORDER = { high: 3, medium: 2, low: 1 }
const EVIDENCE_ORDER = { official: 4, public: 3, proxy: 2, demo: 1 }

export const filterSignals = (signals, filters) => signals.filter((signal) => (
  (filters.category === 'all' || signal.category === filters.category)
  && (filters.importance === 'all' || signal.importance === filters.importance)
  && (filters.evidenceType === 'all' || signal.evidenceType === filters.evidenceType)
))

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
