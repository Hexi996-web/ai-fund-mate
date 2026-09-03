import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('matches the research data date exactly so update timestamps cannot collide', () => {
  const verifier = fs.readFileSync(new URL('../../scripts/verify_deployed_interface.mjs', import.meta.url), 'utf8')
  assert.match(verifier, /getByText\(expectedDate, \{ exact: true \}\)/)
  assert.doesNotMatch(verifier, /getByText\(expectedDate\)\.waitFor/)
})
