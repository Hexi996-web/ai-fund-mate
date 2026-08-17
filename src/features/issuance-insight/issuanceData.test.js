import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeIssuancePayload } from './issuanceData.js'

test('accepts a complete issuance insight payload', () => {
  const fund = { code: '000001', name: '示例基金', establishedDate: '2026-08-17' }
  const payload = {
    schemaVersion: 1,
    dataDate: '2026-08-17',
    summary: {},
    rankings: { today: [fund], week: [], quarter: [], ytd: [] },
    suspensions: [],
  }
  assert.equal(normalizeIssuancePayload(payload), payload)
})

test('rejects incomplete payloads', () => {
  assert.equal(normalizeIssuancePayload({ schemaVersion: 1 }), null)
})
