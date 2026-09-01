import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRankedDirections, HORIZON_IDS } from './horizonRanking.js'

const proof = (id, attention, flow) => ({
  id, verified: true,
  attention: { score: attention }, capacity: { score: 60 },
  validation: { scoreComponents: { estimatedNetFlow: flow, growthBreadth: 50, scaleGrowthRate: 50, newLaunches: 20, effectiveProducts: 30, concentrationBalance: 50 } },
})

test('uses separate horizon histories for displayed rank movement', () => {
  const first = 'ai-agent'
  const second = 'embodied-ai'
  const snapshot = {
    items: [proof(first, 80, 80), proof(second, 60, 60)],
    rankingHistory: [
      { horizonRankedIds: { quarter: [second, first], halfYear: [first, second], year: [second, first] } },
      { horizonRankedIds: { quarter: [first, second], halfYear: [first, second], year: [first, second] } },
    ],
  }
  const quarter = buildRankedDirections(snapshot, 'quarter')
  const halfYear = buildRankedDirections(snapshot, 'halfYear')
  assert.equal(quarter.find(({ id }) => id === first).rankDelta, 1)
  assert.equal(halfYear.find(({ id }) => id === first).rankDelta, 0)
})

test('defines all three persisted ranking horizons', () => {
  assert.deepEqual(HORIZON_IDS, ['quarter', 'halfYear', 'year'])
})
