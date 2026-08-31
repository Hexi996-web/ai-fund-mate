const cache = new Map()

export async function fetchResearchHistory(themeId, { signal, days = 370 } = {}) {
  if (!themeId) return null
  const key = `${themeId}:${days}`
  if (cache.has(key)) return cache.get(key)
  const request = fetch(`/api/history/research?themeId=${encodeURIComponent(themeId)}&days=${days}`, { signal })
    .then((response) => {
      if (!response.ok) throw new Error(`history request failed: ${response.status}`)
      return response.json()
    })
    .catch((error) => {
      cache.delete(key)
      throw error
    })
  cache.set(key, request)
  return request
}

export function mergeThemeAttention(fallback, themeId, rows = []) {
  if (!rows.length) return fallback
  const byDate = new Map((fallback?.daily || []).map((item) => [item.date, { ...item, themes: { ...(item.themes || {}) } }]))
  rows.forEach((row) => {
    const date = String(row.data_date || '').slice(0, 10)
    const item = byDate.get(date) || { date, samples: row.sample_count || 0, themes: {} }
    item.samples = Math.max(item.samples || 0, row.sample_count || 0)
    item.themes[themeId] = { appearances: row.appearances, resonance: row.resonance, bestRank: row.best_rank }
    byDate.set(date, item)
  })
  return { ...fallback, daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), source: 'database' }
}
