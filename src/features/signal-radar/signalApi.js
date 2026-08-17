const DEFAULT_URL = '/data/signal-radar.json'
let lastValidSnapshot = null

const isDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const assert = (condition, message) => { if (!condition) throw new Error(`信号快照无效：${message}`) }

export function validateSignalSnapshot(payload) {
  assert(payload && typeof payload === 'object', '根节点缺失')
  assert(payload.schemaVersion === 1, '不支持的 schemaVersion')
  assert(isDate(payload.generatedAt), 'generatedAt 缺失')
  assert(payload.health && typeof payload.health.fresh === 'boolean', 'health 缺失')
  assert(Array.isArray(payload.signals), 'signals 缺失')
  assert(Array.isArray(payload.themes) && Array.isArray(payload.catalysts), '主题或催化剂缺失')
  payload.signals.forEach((signal) => {
    assert(signal.id && signal.title && signal.category, '信号必填字段缺失')
    assert(Array.isArray(signal.sources) && signal.sources.length > 0, `${signal.id} 缺少可追溯来源`)
    signal.sources.forEach((source) => assert(source.url && /^https?:\/\//.test(source.url), `${signal.id} 来源链接无效`))
  })
  return payload
}

export async function fetchSignalSnapshot(fetchImpl = globalThis.fetch, url = DEFAULT_URL) {
  try {
    const response = await fetchImpl(url, { cache: 'no-store' })
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`)
    const snapshot = validateSignalSnapshot(await response.json())
    lastValidSnapshot = snapshot
    return { state: snapshot.health.fresh ? 'ready' : 'stale', snapshot, error: null }
  } catch (error) {
    if (lastValidSnapshot) return { state: 'stale', snapshot: lastValidSnapshot, error }
    throw error
  }
}

export function resetSignalSnapshotCache() { lastValidSnapshot = null }
