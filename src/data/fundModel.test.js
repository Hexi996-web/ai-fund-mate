import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyFund, normalizeFunds, selectFunds } from './fundModel.js'

test('normalizes real fields and excludes terminated records', () => {
  const funds = normalizeFunds({
    funds: [
      {
        code: '1',
        name: '\u793a\u4f8b\u6df7\u5408',
        type: '\u6df7\u5408\u578b',
        netValue: '1.25',
        dailyChangePercent: '0.4%',
        lastNetValueDate: '2026-08-08',
        purchaseStatus: '\u5f00\u653e\u7533\u8d2d',
        redemptionStatus: '\u5f00\u653e\u8d4e\u56de',
        operationStatus: 'active',
      },
      { code: '2', name: '\u5df2\u6e05\u76d8\u57fa\u91d1', operationStatus: 'terminated' },
    ],
  })

  assert.deepEqual(funds, [{
    code: '000001', name: '\u793a\u4f8b\u6df7\u5408', type: '\u6df7\u5408\u578b', netValue: 1.25,
    dailyChangePercent: 0.4, lastNetValueDate: '2026-08-08', purchaseStatus: '\u5f00\u653e\u7533\u8d2d',
    redemptionStatus: '\u5f00\u653e\u8d4e\u56de', operationStatus: 'active',
  }])
})

test('classifies FOF from a recognized type before broader keywords', () => {
  assert.equal(classifyFund({ name: '\u517b\u8001\u6df7\u5408', type: 'FOF-\u7a33\u5065\u578b' }), 'FOF')
})

test('uses a recognized real type even when the name contains a conflicting category', () => {
  assert.equal(classifyFund({ name: '\u5609\u5b9e\u6d77\u5916\u4e2d\u56fd\u80a1\u7968\u6df7\u5408', type: 'QDII-\u6df7\u5408\u504f\u80a1' }), '\u6df7\u5408\u578b')
  assert.equal(classifyFund({ name: '\u6df7\u5408\u503a\u5238\u7b56\u7565', type: '\u80a1\u7968\u578b' }), '\u80a1\u7968\u578b')
})

const sampleFunds = [
  { code: '000001', name: '\u6d88\u8d39\u80a1\u7968A', type: '\u80a1\u7968\u578b', dailyChangePercent: 1.2, netValue: 1.1, lastNetValueDate: '2026-08-07' },
  { code: '000002', name: '\u6d88\u8d39\u80a1\u7968B', type: '\u80a1\u7968\u578b', dailyChangePercent: 3.4, netValue: 1.4, lastNetValueDate: '2026-08-08' },
  { code: '000003', name: '\u6d88\u8d39\u80a1\u7968C', type: '\u80a1\u7968\u578b', dailyChangePercent: null, netValue: null, lastNetValueDate: null },
  { code: '000004', name: '\u533b\u7597\u6df7\u5408', type: '\u6df7\u5408\u578b', dailyChangePercent: 9.9, netValue: 2.1, lastNetValueDate: '2026-08-09' },
]

test('combines search category and descending return sort with null last', () => {
  const result = selectFunds(sampleFunds, { query: '\u6d88\u8d39', category: '\u80a1\u7968\u578b', sortMode: 'change-desc' })
  assert.deepEqual(result.map((fund) => fund.code), ['000002', '000001', '000003'])
})

test('sorts every supported real field without mutating input and keeps null last', () => {
  const originalCodes = sampleFunds.map((fund) => fund.code)
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'change-asc' }).map((fund) => fund.code), ['000001', '000002', '000004', '000003'])
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'nav-desc' }).map((fund) => fund.code), ['000004', '000002', '000001', '000003'])
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'nav-asc' }).map((fund) => fund.code), ['000001', '000002', '000004', '000003'])
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'date-desc' }).map((fund) => fund.code), ['000004', '000002', '000001', '000003'])
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'date-asc' }).map((fund) => fund.code), ['000001', '000002', '000004', '000003'])
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'code-asc' }).map((fund) => fund.code), ['000001', '000002', '000003', '000004'])
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'code-desc' }).map((fund) => fund.code), ['000004', '000003', '000002', '000001'])
  assert.deepEqual(selectFunds(sampleFunds, { sortMode: 'default' }).map((fund) => fund.code), originalCodes)
  assert.deepEqual(sampleFunds.map((fund) => fund.code), originalCodes)
})

test('normalizes aliases, missing values, duplicate codes, and invalid dates without synthesizing data', () => {
  const funds = normalizeFunds({ funds: [
    { fundcode: '3', fundname: 'Alias', fundtype: 'Bond', netvalue: 'not-a-number', daygrowth: '-1.5%', date: '2026-02-30' },
    { code: '000003', name: 'Duplicate' },
  ] })

  assert.deepEqual(funds, [{
    code: '000003', name: 'Alias', type: 'Bond', netValue: null, dailyChangePercent: -1.5,
    lastNetValueDate: null, purchaseStatus: null, redemptionStatus: null, operationStatus: null,
  }])
})

test('rejects a payload containing only malformed records without identities', () => {
  assert.deepEqual(normalizeFunds({ funds: [
    null,
    {},
    { code: '1' },
    { name: '缺少代码' },
    { code: '   ', name: '空代码' },
    { code: '2', name: '   ' },
  ] }), [])
})

test('search matches only fund code and name, never type alone', () => {
  const funds = [{ code: '000010', name: '稳健成长', type: '股票型' }]

  assert.deepEqual(selectFunds(funds, { query: '股票型' }), [])
  assert.deepEqual(selectFunds(funds, { query: '000010' }), funds)
  assert.deepEqual(selectFunds(funds, { query: '稳健' }), funds)
})
