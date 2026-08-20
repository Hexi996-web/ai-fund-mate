import test from 'node:test'
import assert from 'node:assert/strict'
import { DATA_STATUS_URL, fetchDataStatus } from './dataStatus.js'

const response = (payload, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => payload })

test('loads a valid lightweight data status without browser caching', async () => {
  const calls = []
  const payload = { schemaVersion: 1, productsUpdateTime: '2026-08-20 07:00:00' }
  const result = await fetchDataStatus(async (url, options) => {
    calls.push({ url, options })
    return response(payload)
  })
  assert.deepEqual(result, payload)
  assert.deepEqual(calls, [{ url: DATA_STATUS_URL, options: { cache: 'no-store' } }])
})

test('rejects malformed or failed data status responses', async () => {
  await assert.rejects(() => fetchDataStatus(async () => response({}, false)), /503/)
  await assert.rejects(() => fetchDataStatus(async () => response({ schemaVersion: 1 })), /结构无效/)
})
