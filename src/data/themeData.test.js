import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeThemeWorkspace } from './themeData.js'

test('merges score and scenario records by theme without inventing probabilities', () => {
  const result = mergeThemeWorkspace(
    { themes: [{ theme: 'gold', score: 57.5, confidence: { score: 72.5 }, evidence: {}, degradedReasons: [] }] },
    { themes: [{ theme: 'gold', status: 'insufficient_history', scenarios: [] }] },
  )
  assert.equal(result[0].theme, 'gold')
  assert.equal(result[0].scenarioStatus, 'insufficient_history')
  assert.deepEqual(result[0].scenarios, [])
})
