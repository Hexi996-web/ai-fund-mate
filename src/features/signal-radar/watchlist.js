export const WATCHLIST_KEY = 'ai-fund-mate:signal-watchlist:v1'

const normalizeIds = (value) => {
  if (!Array.isArray(value)) return null
  return [...new Set(value.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))]
}

export const readWatchlist = (storage) => {
  try {
    const raw = storage?.getItem(WATCHLIST_KEY)
    if (raw === null) return []
    const ids = normalizeIds(JSON.parse(raw))
    if (ids === null) throw new Error('Invalid watchlist schema')
    return ids
  } catch {
    try { storage?.removeItem(WATCHLIST_KEY) } catch { /* storage may be unavailable */ }
    return []
  }
}

export const writeWatchlist = (storage, ids) => {
  const normalized = normalizeIds(ids) ?? []
  try { storage?.setItem(WATCHLIST_KEY, JSON.stringify(normalized)) } catch { /* non-blocking preference */ }
}

export const toggleWatchlist = (storage, ids, id) => {
  const current = normalizeIds(ids) ?? []
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  writeWatchlist(storage, next)
  return next
}
