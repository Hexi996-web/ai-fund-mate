import test from 'node:test'
import assert from 'node:assert/strict'
import { THEME_NAMES } from './themeData.js'

test('uses scalable fund-oriented theme names', () => {
  assert.equal(THEME_NAMES.dividend, '红利基金')
  assert.equal(THEME_NAMES.bond, '债券基金')
})
