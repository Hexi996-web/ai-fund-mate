import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDisplayFunds } from './fundDisplay.js'

test('limits initial DOM rendering while preserving the total result count', () => {
  const funds = Array.from({ length: 250 }, (_, index) => ({ code: String(index) }))
  const result = selectDisplayFunds(funds)
  assert.equal(result.total, 250)
  assert.equal(result.items.length, 200)
  assert.equal(result.truncated, true)
})
