export const ISSUANCE_INSIGHTS_URL = '/issuance_insights.json'

const validFund = (fund) => typeof fund?.code === 'string'
  && typeof fund?.name === 'string'
  && typeof fund?.establishedDate === 'string'

export const normalizeIssuancePayload = (payload) => {
  if (payload?.schemaVersion !== 1 || typeof payload?.dataDate !== 'string') return null
  if (!payload?.summary || !payload?.rankings || !Array.isArray(payload?.suspensions)) return null
  const windows = ['today', 'week', 'quarter', 'ytd']
  if (!windows.every((window) => Array.isArray(payload.rankings[window]) && payload.rankings[window].every(validFund))) return null
  return payload
}

export const fetchIssuanceInsights = async (fetchImpl = fetch, options = {}) => {
  const response = await fetchImpl(ISSUANCE_INSIGHTS_URL, options)
  if (!response.ok) throw new Error(`发行洞察数据请求失败（${response.status}）`)
  const payload = normalizeIssuancePayload(await response.json())
  if (!payload) throw new Error('发行洞察数据结构无效')
  return payload
}
