import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fallbackProductsFromShares,
  normalizeProducts,
  selectProducts,
} from './fundProductModel.js'

const share = (code, name, shareClass, overrides = {}) => ({
  code, name, shareClass, type: '股票型', netValue: 1, dailyChangePercent: 1,
  lastNetValueDate: '2026-08-12', ...overrides,
})

const payload = {
  productTotal: 1,
  shareTotal: 2,
  products: [{
    productId: 'prd_1234567890abcdef',
    productName: '示例基金',
    type: '股票型',
    representativeCode: '000001',
    shareCount: 2,
    groupingConfidence: 'high',
    shares: [share('000001', '示例基金A', 'A'), share('000002', '示例基金C', 'C')],
  }],
}

test('normalizes a valid product payload and rejects inconsistent totals', () => {
  assert.equal(normalizeProducts(payload).length, 1)
  assert.deepEqual(normalizeProducts({ ...payload, shareTotal: 3 }), [])
  assert.deepEqual(normalizeProducts({
    ...payload,
    products: [{ ...payload.products[0], representativeCode: '999999' }],
  }), [])
})

test('creates one low-confidence product per legacy share without guessing groups', () => {
  const products = fallbackProductsFromShares({ funds: [
    { code: '1', name: '示例基金A', type: '股票型' },
    { code: '2', name: '示例基金C', type: '股票型' },
  ] })
  assert.equal(products.length, 2)
  assert.deepEqual(products.map((item) => item.productId), ['fallback_000001', 'fallback_000002'])
  assert.ok(products.every((item) => item.groupingConfidence === 'low'))
})

test('searches any share code and returns its product plus matched share code', () => {
  const result = selectProducts(normalizeProducts(payload), { query: '000002' })
  assert.equal(result.products.length, 1)
  assert.deepEqual([...result.matchedShareCodes], ['000002'])
})

test('sorts products using representative share and keeps missing values last', () => {
  const products = normalizeProducts({
    productTotal: 2, shareTotal: 2, products: [
      { ...payload.products[0], productId: 'p1', shareCount: 1, shares: [share('000001', '甲A', 'A', { dailyChangePercent: null })] },
      { ...payload.products[0], productId: 'p2', productName: '乙', representativeCode: '000003', shareCount: 1, shares: [share('000003', '乙A', 'A', { dailyChangePercent: 2 })] },
    ],
  })
  assert.deepEqual(selectProducts(products, { sortMode: 'change-desc' }).products.map((item) => item.productId), ['p2', 'p1'])
})

test('aggregates share-class scale, uses the weakest quality, and sorts by scale', () => {
  const products = normalizeProducts({
    productTotal: 2, shareTotal: 3, products: [
      { ...payload.products[0], productId: 'p1', shares: [
        share('000001', '甲A', 'A', { scaleYi: 8, scaleQuality: 'A', scaleDate: '2026-08-18' }),
        share('000002', '甲C', 'C', { scaleYi: 2, scaleQuality: 'C', scaleDate: '2026-08-18' }),
      ] },
      { ...payload.products[0], productId: 'p2', productName: '乙', representativeCode: '000003', shareCount: 1, shares: [
        share('000003', '乙A', 'A', { scaleYi: 20, scaleQuality: 'B', scaleDate: '2026-08-18' }),
      ] },
    ],
  })
  assert.equal(products[0].scaleYi, 10)
  assert.equal(products[0].scaleQuality, 'C')
  assert.deepEqual(selectProducts(products, { sortMode: 'scale-desc' }).products.map((item) => item.productId), ['p2', 'p1'])
})
