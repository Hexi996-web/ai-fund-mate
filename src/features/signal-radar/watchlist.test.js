import test from 'node:test'
import assert from 'node:assert/strict'
import { readWatchlist, toggleWatchlist, WATCHLIST_KEY, writeWatchlist } from './watchlist.js'

const memoryStorage = (initial = {}) => ({
  values: { ...initial },
  getItem(key) { return this.values[key] ?? null },
  setItem(key, value) { this.values[key] = value },
  removeItem(key) { delete this.values[key] },
})

test('returns an empty watchlist and removes corrupt storage', () => {
  const storage = memoryStorage({ [WATCHLIST_KEY]: '{bad' })
  assert.deepEqual(readWatchlist(storage), [])
  assert.equal(storage.getItem(WATCHLIST_KEY), null)
})

test('accepts only unique non-empty string identifiers', () => {
  const storage = memoryStorage()
  writeWatchlist(storage, ['policy-1', '', 'policy-1', 42, 'market-1'])
  assert.deepEqual(readWatchlist(storage), ['policy-1', 'market-1'])
})

test('toggles a signal and persists the next list', () => {
  const storage = memoryStorage()
  const added = toggleWatchlist(storage, [], 'policy-1')
  assert.deepEqual(added, ['policy-1'])
  assert.deepEqual(readWatchlist(storage), ['policy-1'])
  assert.deepEqual(toggleWatchlist(storage, added, 'policy-1'), [])
  assert.deepEqual(readWatchlist(storage), [])
})
