import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchSignalSnapshot, resetSignalSnapshotCache } from './signalApi.js'

const valid = { schemaVersion: 1, generatedAt: '2026-08-14T00:00:00Z', health: { fresh: true }, signals: [{ id: 'x', title: 'x', category: 'policy', sources: [{ url: 'https://example.com' }] }], themes: [], catalysts: [], dailyBrief: null }
const fakeFetch = (payload, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => payload })

test('rejects a signal snapshot without source traceability', async () => {
  resetSignalSnapshotCache()
  await assert.rejects(() => fetchSignalSnapshot(fakeFetch({ ...valid, signals: [{ id: 'x', title: 'x', category: 'policy', sources: [] }] })), /可追溯来源/)
})

test('returns the last valid snapshot as stale when refresh fails', async () => {
  resetSignalSnapshotCache()
  await fetchSignalSnapshot(fakeFetch(valid))
  const result = await fetchSignalSnapshot(fakeFetch({}, false))
  assert.equal(result.state, 'stale')
  assert.equal(result.snapshot.signals[0].id, 'x')
})
