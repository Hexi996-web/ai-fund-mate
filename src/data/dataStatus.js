export const DATA_STATUS_URL = '/data_status.json'
export const DATA_STATUS_POLL_MS = 2 * 60 * 1000

export const fetchDataStatus = async (fetchImpl = fetch, options = {}) => {
  const response = await fetchImpl(DATA_STATUS_URL, { cache: 'no-store', ...options })
  if (!response.ok) throw new Error(`数据状态请求失败（${response.status}）`)
  const payload = await response.json()
  if (![1, 2].includes(payload?.schemaVersion) || typeof payload?.productsUpdateTime !== 'string') {
    throw new Error('数据状态结构无效')
  }
  return payload
}
