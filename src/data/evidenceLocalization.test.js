import test from 'node:test'
import assert from 'node:assert/strict'
import { explainGap, localizeEvidence, localizeRule } from './evidenceLocalization.js'

test('localizes known evidence rules and uses a safe Chinese fallback', () => {
  assert.equal(localizeRule('no current observation'), '当前没有可用观测值，本项暂不计分。')
  assert.match(localizeRule('single snapshot confirms availability only; trend unavailable'), /单期数据/)
  assert.equal(localizeRule('unknown internal rule'), '当前规则说明尚未完成中文适配，请结合已列示数据审慎判断。')
})

test('localizes evidence indicator codes without changing values', () => {
  assert.equal(localizeEvidence('gold_price_cny=946.7 元/克 (2026-08-11)'), '人民币黄金价格：946.7 元/克（2026-08-11）')
  assert.equal(localizeEvidence('政策文本标题'), '政策文本标题')
})

test('explains known gaps with cause and research impact', () => {
  const gap = explainGap('dividend_yield=source_unavailable')
  assert.equal(gap.title, '红利指数股息率')
  assert.match(gap.reason, /公开数据源暂不可用/)
  assert.match(gap.impact, /估值/)
  const unknown = explainGap('mystery=parse_failed')
  assert.equal(unknown.title, '相关研究指标')
  assert.match(unknown.reason, /解析失败/)
})
