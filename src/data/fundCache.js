export const FUND_CACHE_KEY = 'ai-fund-mate:fund-products:v4'
export const LEGACY_FUND_CACHE_KEY = 'ai-fund-mate:funds:v3'
export const SCHEMA_VERSION = 4

const preferenceKey = (key) => `ai-fund-mate:preference:${key}`

const isValidDataDate = (value) => {
  if (value === null) return true
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

const validProductTotals = (value) => {
  if (!Array.isArray(value?.products) || value.productTotal !== value.products.length) return false
  const shareTotal = value.products.reduce((sum, product) => (
    Array.isArray(product?.shares) && product.shareCount === product.shares.length
      ? sum + product.shares.length
      : Number.NaN
  ), 0)
  return Number.isInteger(value.shareTotal) && shareTotal === value.shareTotal
}

const isValidCache = (value) => (
  value?.schemaVersion === SCHEMA_VERSION
  && typeof value.date === 'string' && value.date.length > 0
  && Object.hasOwn(value, 'dataDate') && isValidDataDate(value.dataDate)
  && Number.isFinite(value.fetchedAt) && value.fetchedAt > 0
  && (value.source === 'products' || value.source === 'active-shares')
  && validProductTotals(value)
)

const removeCache = (storage, key = FUND_CACHE_KEY) => {
  try { storage.removeItem(key) } catch { /* cache cleanup is best effort */ }
}

const readValidFundCache = (storage) => {
  removeCache(storage, LEGACY_FUND_CACHE_KEY)
  let value
  try {
    const cached = storage.getItem(FUND_CACHE_KEY)
    if (cached === null) return null
    value = JSON.parse(cached)
  } catch {
    removeCache(storage)
    return null
  }
  if (!isValidCache(value)) {
    removeCache(storage)
    return null
  }
  return value
}

export const readFundCache = (storage, today) => {
  const value = readValidFundCache(storage)
  return value?.date === today ? value : null
}

export const readStaleFundCache = (storage, today) => {
  const value = readValidFundCache(storage)
  return value !== null && value.date !== today ? value : null
}

export const writeFundCache = (storage, value) => {
  const cache = {
    schemaVersion: SCHEMA_VERSION,
    date: value.date,
    dataDate: value.dataDate,
    fetchedAt: value.fetchedAt,
    source: value.source,
    products: value.products,
    productTotal: value.productTotal,
    shareTotal: value.shareTotal,
  }
  if (!isValidCache(cache)) return false
  try { storage.setItem(FUND_CACHE_KEY, JSON.stringify(cache)); return true } catch { return false }
}

export const readPreference = (storage, key, fallback) => {
  try { const value = storage.getItem(preferenceKey(key)); return value === null ? fallback : JSON.parse(value) } catch { return fallback }
}

export const writePreference = (storage, key, value) => {
  try { storage.setItem(preferenceKey(key), JSON.stringify(value)); return true } catch { return false }
}