import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readFundCache,
  readPreference,
  readStaleFundCache,
  writeFundCache,
  writePreference,
} from './fundCache.js'

class MemoryStorage {
  values = new Map()
  removed = []
  setCalls = 0

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.setCalls += 1
    this.values.set(key, value)
  }

  removeItem(key) {
    this.removed.push(key)
    this.values.delete(key)
  }
}

const CACHE_KEY = 'ai-fund-mate:fund-products:v4'
const OLD_CACHE_KEY = 'ai-fund-mate:funds:v3'
const today = '2026-08-10'
const yesterday = '2026-08-09'
const fetchedAt = 1786320000000
const cachedProducts = [{ productId: 'p1', shareCount: 1, shares: [{ code: '000001' }] }]
const cacheInput = { date: today, dataDate: '2026-08-08', fetchedAt, source: 'products', products: cachedProducts, productTotal: 1, shareTotal: 1 }

const storedCache = (overrides = {}) => ({
  schemaVersion: 4,
  date: today,
  dataDate: '2026-08-08',
  fetchedAt,
  source: 'products',
  products: cachedProducts,
  productTotal: 1,
  shareTotal: 1,
  ...overrides,
})

test('reuses a complete valid v3 cache written today', () => {
  const storage = new MemoryStorage()

  assert.equal(writeFundCache(storage, cacheInput), true)
  assert.deepEqual(readFundCache(storage, today), storedCache())
})

test('invalidates an old v3 cache that does not contain dataDate', () => {
  const storage = new MemoryStorage()
  storage.setItem(CACHE_KEY, JSON.stringify({
    schemaVersion: 4,
    date: today,
    fetchedAt,
    source: 'products',
    products: cachedProducts,
    productTotal: 1,
    shareTotal: 1,
  }))

  assert.equal(readFundCache(storage, today), null)
  assert.ok(storage.removed.includes(CACHE_KEY))
})

test('rejects a cache with an impossible snapshot data date', () => {
  const storage = new MemoryStorage()

  assert.equal(writeFundCache(storage, { ...cacheInput, dataDate: '2026-02-30' }), false)
  assert.equal(storage.getItem(CACHE_KEY), null)
})
test('preserves an explicitly unavailable snapshot data date', () => {
  const storage = new MemoryStorage()

  assert.equal(writeFundCache(storage, { ...cacheInput, dataDate: null }), true)
  assert.equal(readFundCache(storage, today).dataDate, null)
})
test('rejects incomplete v3 caches without fetchedAt', () => {
  const storage = new MemoryStorage()
  storage.setItem(CACHE_KEY, JSON.stringify({
    schemaVersion: 4,
    date: today,
    source: 'products',
    products: cachedProducts,
    productTotal: 1,
    shareTotal: 1,
  }))

  assert.equal(readFundCache(storage, today), null)
})

test('writes the complete v3 cache in one storage operation', () => {
  const storage = new MemoryStorage()

  assert.equal(writeFundCache(storage, cacheInput), true)
  assert.equal(storage.setCalls, 1)
  assert.deepEqual(JSON.parse(storage.getItem(CACHE_KEY)), storedCache())
})

test('exposes only a complete valid cache from a previous day as stale', () => {
  const storage = new MemoryStorage()
  const stale = storedCache({ date: yesterday })
  storage.setItem(CACHE_KEY, JSON.stringify(stale))

  assert.deepEqual(readStaleFundCache(storage, today), stale)
  assert.equal(readFundCache(storage, today), null)

  storage.setItem(CACHE_KEY, JSON.stringify(storedCache()))
  assert.equal(readStaleFundCache(storage, today), null)
})

test('rejects v2 caches and caches from a previous day', () => {
  const storage = new MemoryStorage()

  storage.setItem(CACHE_KEY, JSON.stringify(storedCache({ schemaVersion: 2 })))
  assert.equal(readFundCache(storage, today), null)

  storage.setItem(CACHE_KEY, JSON.stringify(storedCache({ date: yesterday })))
  assert.equal(readFundCache(storage, today), null)
})

test('removes malformed cached JSON before returning no cache', () => {
  const storage = new MemoryStorage()
  storage.setItem(CACHE_KEY, '{invalid')

  assert.equal(readFundCache(storage, today), null)
  assert.ok(storage.removed.includes(CACHE_KEY))
})

test('does not throw when cache storage is full', () => {
  const storage = new MemoryStorage()
  storage.setItem = () => {
    throw new Error('QuotaExceededError')
  }

  assert.equal(writeFundCache(storage, cacheInput), false)
})

test('persists preferences independently from the fund cache', () => {
  const storage = new MemoryStorage()
  writeFundCache(storage, cacheInput)

  assert.equal(writePreference(storage, 'sortMode', 'change-desc'), true)
  assert.equal(readPreference(storage, 'sortMode', 'default'), 'change-desc')
  assert.equal(readPreference(storage, 'category', 'all'), 'all')
  assert.notEqual(storage.getItem(CACHE_KEY), null)
})
test('invalidates and removes the legacy v3 fund-share cache', () => {
  const storage = new MemoryStorage()
  storage.setItem(OLD_CACHE_KEY, JSON.stringify({ schemaVersion: 3, funds: [] }))
  assert.equal(readFundCache(storage, today), null)
  assert.ok(storage.removed.includes(OLD_CACHE_KEY))
})

test('rejects product cache when totals do not match nested shares', () => {
  const storage = new MemoryStorage()
  assert.equal(writeFundCache(storage, { ...cacheInput, shareTotal: 2 }), false)
})
