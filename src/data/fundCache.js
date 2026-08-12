export const FUND_CACHE_KEY = 'ai-fund-mate:funds:v3'
export const SCHEMA_VERSION = 3

const preferenceKey = (key) => `ai-fund-mate:preference:${key}`

const isValidDataDate = (value) => {
  if (value === null) return true
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

const isValidCache = (value) => (
  value?.schemaVersion === SCHEMA_VERSION
  && typeof value.date === 'string'
  && value.date.length > 0
  && Object.hasOwn(value, 'dataDate')
  && isValidDataDate(value.dataDate)
  && Number.isFinite(value.fetchedAt)
  && value.fetchedAt > 0
  && (value.source === 'active' || value.source === 'fallback')
  && Array.isArray(value.funds)
)

const removeFundCache = (storage) => {
  try {
    storage.removeItem(FUND_CACHE_KEY)
  } catch {
    // Cache cleanup must not disrupt fund loading.
  }
}

const readValidFundCache = (storage) => {
  let value

  try {
    const cached = storage.getItem(FUND_CACHE_KEY)
    if (cached === null) return null
    value = JSON.parse(cached)
  } catch {
    removeFundCache(storage)
    return null
  }

  if (!isValidCache(value)) {
    removeFundCache(storage)
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
    funds: value.funds,
  }

  if (!isValidCache(cache)) return false

  try {
    storage.setItem(FUND_CACHE_KEY, JSON.stringify(cache))
    return true
  } catch {
    return false
  }
}

export const readPreference = (storage, key, fallback) => {
  try {
    const value = storage.getItem(preferenceKey(key))
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

export const writePreference = (storage, key, value) => {
  try {
    storage.setItem(preferenceKey(key), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
