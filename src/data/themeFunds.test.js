import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBondFund, joinThemeFunds } from './themeFunds.js'

test('joins funds and prioritizes reviewed mappings before confidence', () => {
  const links = [
    { fund_code: '1', theme: 'gold', review_status: 'auto', confidence: 0.99, match_type: 'rule', matched_rule: 'gold' },
    { fund_code: '2', theme: 'gold', review_status: 'reviewed', confidence: 0.8, match_type: 'override', matched_rule: 'manual' },
  ]
  const payload = { funds: [{ code: '000001', name: '黄金一号', type: '商品基金' }, { code: '000002', name: '黄金二号', type: 'ETF' }] }
  const group = joinThemeFunds(links, payload).get('gold')
  assert.deepEqual(group.featured.map((item) => item.code), ['000002', '000001'])
  assert.match(group.featured[0].analysis, /不构成投资建议/)
})

test('keeps a linked code when fund metadata is missing and limits featured funds', () => {
  const links = Array.from({ length: 7 }, (_, index) => ({ fund_code: String(index + 1), theme: 'bond', review_status: 'auto', confidence: 0.9, match_type: 'rule', matched_rule: 'bond' }))
  const group = joinThemeFunds(links, { funds: [] }).get('bond')
  assert.equal(group.featured.length, 5)
  assert.equal(group.featured[0].name, '暂无公开数据')
})

test('classifies common bond fund subtypes without forcing unknown records', () => {
  assert.equal(classifyBondFund({ name: '中短债基金', type: '债券型' }), '短债')
  assert.equal(classifyBondFund({ name: '纯债一年持有', type: '债券型' }), '纯债')
  assert.equal(classifyBondFund({ name: '稳健二级债基', type: '混合债券型' }), '混合债')
  assert.equal(classifyBondFund({ name: '可转债精选', type: '债券型' }), '可转债')
  assert.equal(classifyBondFund({ name: '债券ETF', type: 'ETF' }), '债券ETF')
  assert.equal(classifyBondFund({ name: '稳健收益', type: '债券型' }), '其他债券基金')
})
