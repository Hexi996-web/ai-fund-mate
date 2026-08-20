export const FUND_PRODUCTS_URL =
  '/fund_products.json'

export const ACTIVE_FUNDS_URL =
  '/funds_active.json'

export const EXCLUDED_FUNDS_URL =
  '/funds_excluded.json'

export const SOURCE_FUNDS_URL =
  'https://LST-Serendipity.github.io/fund-data-api/funds_simple.json'

export const getPayloadDataDate = (payload) => {
  const value = payload?.updateTime ?? payload?.update_time
  if (value === null || value === undefined) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim())
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? match[0]
    : null
}

const requestJson = async (fetchImpl, url, options) => {
  const response = await fetchImpl(url, { cache: 'no-store', ...options })
  if (!response.ok) throw new Error(`数据请求失败（${response.status}）`)
  return response.json()
}

const normalizeCode = (value) => {
  if (value === null || value === undefined) return null
  const code = String(value).trim()
  return code ? code.padStart(6, '0') : null
}

const readExcludedCodes = (payload) => {
  if (
    typeof payload?.updateTime !== 'string'
    || !Number.isInteger(payload?.total)
    || !Array.isArray(payload?.funds)
    || payload.total !== payload.funds.length
  ) {
    throw new Error('隔离基金数据无效')
  }

  const codes = payload.funds.map((fund) => normalizeCode(fund?.code))
  if (codes.some((code) => code === null)) throw new Error('隔离基金数据无效')
  return new Set(codes)
}

export const fetchFundPayload = async (fetchImpl = fetch, options = {}) => {
  try {
    const payload = await requestJson(fetchImpl, ACTIVE_FUNDS_URL, options)
    if (!Array.isArray(payload?.funds) || payload.funds.length === 0) {
      throw new Error('活跃基金数据为空')
    }
    return { payload, source: 'active' }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
  }

  const excludedPayload = await requestJson(fetchImpl, EXCLUDED_FUNDS_URL, options)
  const excludedCodes = readExcludedCodes(excludedPayload)
  const payload = await requestJson(fetchImpl, SOURCE_FUNDS_URL, options)
  const funds = Array.isArray(payload?.funds)
    ? payload.funds.filter((fund) => !excludedCodes.has(normalizeCode(fund?.code)))
    : []
  return { payload: { ...payload, funds }, source: 'fallback' }
}
export const fetchFundProductPayload = async (fetchImpl = fetch, options = {}) => {
  try {
    const payload = await requestJson(fetchImpl, FUND_PRODUCTS_URL, options)
    if (!Array.isArray(payload?.products) || payload.products.length === 0) {
      throw new Error('基金产品数据为空')
    }
    return { payload, source: 'products' }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
  }

  const payload = await requestJson(fetchImpl, ACTIVE_FUNDS_URL, options)
  if (!Array.isArray(payload?.funds) || payload.funds.length === 0) {
    throw new Error('活跃基金份额数据为空')
  }
  return { payload, source: 'active-shares' }
}
