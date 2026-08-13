import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVE_FUNDS_URL,
  FUND_PRODUCTS_URL,
  EXCLUDED_FUNDS_URL,
  SOURCE_FUNDS_URL,
  fetchFundPayload,
  fetchFundProductPayload,
  getPayloadDataDate,
} from './fundData.js'

const response = (ok, payload, status = 200) => ({
  ok,
  status,
  json: async () => payload,
})

test('returns the active payload with its active source marker', async () => {
  const calls = []
  const payload = { updateTime: '2026-08-10 14:13:11', funds: [{ code: '000001' }] }
  const fetchImpl = async (url) => {
    calls.push(url)
    return response(true, payload)
  }

  const result = await fetchFundPayload(fetchImpl)

  assert.deepEqual(calls, [ACTIVE_FUNDS_URL])
  assert.deepEqual(result, { payload, source: 'active' })
})

test('filters the simple fallback with the real excluded snapshot contract', async () => {
  const calls = []
  const excludedPayload = {
    updateTime: '2026-08-10 14:13:11',
    total: 1,
    funds: [{
      code: '000002',
      name: '已隔离基金',
      operationStatus: 'suspected_terminated',
      lastNetValueDate: null,
      exclusionReason: '超过60天无净值',
    }],
  }
  const fallbackPayload = {
    updateTime: '2026-08-10 15:00:00',
    total: 2,
    funds: [
      { code: '000002', name: '重叠的已隔离基金', type: '混合型' },
      { code: '000003', name: '仍活跃基金', type: '股票型' },
    ],
  }
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url === ACTIVE_FUNDS_URL) return response(false, null, 404)
    if (url === EXCLUDED_FUNDS_URL) return response(true, excludedPayload)
    return response(true, fallbackPayload)
  }

  const result = await fetchFundPayload(fetchImpl)

  assert.deepEqual(calls, [ACTIVE_FUNDS_URL, EXCLUDED_FUNDS_URL, SOURCE_FUNDS_URL])
  assert.deepEqual(result, {
    payload: {
      ...fallbackPayload,
      funds: [{ code: '000003', name: '仍活跃基金', type: '股票型' }],
    },
    source: 'fallback',
  })
})

test('falls back when the active snapshot has no usable funds', async () => {
  const calls = []
  const fallbackPayload = { funds: [{ code: '000003' }] }
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url === ACTIVE_FUNDS_URL) return response(true, { funds: [] })
    if (url === EXCLUDED_FUNDS_URL) return response(true, { updateTime: '2026-08-10 14:13:11', total: 0, funds: [] })
    return response(true, fallbackPayload)
  }

  const result = await fetchFundPayload(fetchImpl)

  assert.deepEqual(calls, [ACTIVE_FUNDS_URL, EXCLUDED_FUNDS_URL, SOURCE_FUNDS_URL])
  assert.deepEqual(result, { payload: fallbackPayload, source: 'fallback' })
})

test('refuses a malformed excluded snapshot instead of treating it as an empty code set', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url === ACTIVE_FUNDS_URL) return response(false, null, 503)
    if (url === EXCLUDED_FUNDS_URL) return response(true, { updateTime: '2026-08-10 14:13:11', total: 1, funds: [{}] })
    return response(true, { funds: [{ code: '000002', name: '不应返回' }] })
  }

  await assert.rejects(() => fetchFundPayload(fetchImpl), /隔离基金数据无效/)
  assert.deepEqual(calls, [ACTIVE_FUNDS_URL, EXCLUDED_FUNDS_URL])
})
test('refuses to return an unfiltered fallback when excluded data is unavailable', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url === ACTIVE_FUNDS_URL) return response(false, null, 503)
    return response(false, null, 404)
  }

  await assert.rejects(() => fetchFundPayload(fetchImpl), /404/)
  assert.deepEqual(calls, [ACTIVE_FUNDS_URL, EXCLUDED_FUNDS_URL])
})

test('preserves AbortError while loading the required excluded snapshot', async () => {
  const calls = []
  const abortError = new Error('aborted')
  abortError.name = 'AbortError'
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url === ACTIVE_FUNDS_URL) return response(false, null, 503)
    throw abortError
  }

  await assert.rejects(() => fetchFundPayload(fetchImpl), abortError)
  assert.deepEqual(calls, [ACTIVE_FUNDS_URL, EXCLUDED_FUNDS_URL])
})

test('rethrows an AbortError without requesting the fallback source', async () => {
  const calls = []
  const abortError = new Error('aborted')
  abortError.name = 'AbortError'
  const fetchImpl = async (url) => {
    calls.push(url)
    throw abortError
  }

  await assert.rejects(() => fetchFundPayload(fetchImpl), abortError)
  assert.deepEqual(calls, [ACTIVE_FUNDS_URL])
})

test('throws the fallback request error when the simple source fails', async () => {
  const fetchImpl = async (url) => {
    if (url === ACTIVE_FUNDS_URL) return response(false, null, 404)
    if (url === EXCLUDED_FUNDS_URL) return response(true, { updateTime: '2026-08-10 14:13:11', total: 0, funds: [] })
    return response(false, null, 503)
  }

  await assert.rejects(() => fetchFundPayload(fetchImpl), /503/)
})
test('extracts the truthful snapshot date from either supported update field', () => {
  assert.equal(getPayloadDataDate({ updateTime: '2026-08-10 14:13:11' }), '2026-08-10')
  assert.equal(getPayloadDataDate({ update_time: '2026-08-09T23:00:00+08:00' }), '2026-08-09')
  assert.equal(getPayloadDataDate({ updateTime: 'not-a-date' }), null)
  assert.equal(getPayloadDataDate({}), null)
})
test('prefers the product dataset when it is available', async () => {
  const calls = []
  const payload = { productTotal: 1, shareTotal: 1, products: [{ productId: 'p1' }] }
  const result = await fetchFundProductPayload(async (url) => {
    calls.push(url)
    return response(true, payload)
  })
  assert.deepEqual(calls, [FUND_PRODUCTS_URL])
  assert.deepEqual(result, { payload, source: 'products' })
})

test('falls back to active shares when the product dataset is invalid', async () => {
  const calls = []
  const active = { funds: [{ code: '000001', name: '示例基金A' }] }
  const result = await fetchFundProductPayload(async (url) => {
    calls.push(url)
    if (url === FUND_PRODUCTS_URL) return response(true, { products: [] })
    return response(true, active)
  })
  assert.deepEqual(calls, [FUND_PRODUCTS_URL, ACTIVE_FUNDS_URL])
  assert.deepEqual(result, { payload: active, source: 'active-shares' })
})

test('preserves AbortError while loading product data', async () => {
  const abortError = new Error('aborted')
  abortError.name = 'AbortError'
  await assert.rejects(() => fetchFundProductPayload(async () => { throw abortError }), abortError)
})
