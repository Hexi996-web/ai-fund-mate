import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMarketForecast, compactMarketForecastFacts, createMarketForecastSnapshot, hydrateMarketForecastSnapshot } from './marketForecast.js'

test('builds forecast metrics from the daily product payload', () => {
  const product = (name, type, nav, drawdown, scale, daily = 1) => ({
    productName: name, type, navGrowthPercent: nav, maxDrawdownPercent: drawdown,
    scaleNetIncreaseYi: scale, metricsCoverageStart: '2026-01-02', representativeShare: { dailyChangePercent: daily },
  })
  const forecast = buildMarketForecast({ dataDate: '2026-08-20', products: [
    product('半导体ETF', '指数型-股票', 20, -10, 5),
    product('科技成长基金', '混合型', 10, -20, 3, -1),
  ] })
  const tech = forecast.rows.find((row) => row.id === 'tech')
  assert.equal(forecast.dataDate, '2026-08-20')
  assert.equal(tech.navMedian, 15)
  assert.equal(tech.drawdownMedian, -15)
  assert.equal(tech.scaleNetIncrease, 8)
  assert.equal(tech.upBreadth, 50)
  assert.ok(forecast.baseline.regime)
  assert.ok(forecast.baseline.interpretation)
  assert.ok(forecast.baseline.action)
  assert.equal(typeof forecast.baseline.positiveReturnBreadth, 'number')
})

test('excludes money funds and partial-period products from return comparison', () => {
  const forecast = buildMarketForecast({ dataDate: '2026-08-24', products: [
    { productName:'货币A', type:'货币型-普通货币', navGrowthPercent:166, metricsCoverageStart:'2026-01-02', scaleNetIncreaseYi:2 },
    { productName:'新科技基金', type:'混合型', navGrowthPercent:80, metricsCoverageStart:'2026-06-01', scaleNetIncreaseYi:1 },
    { productName:'科技ETF', type:'指数型-股票', navGrowthPercent:12, maxDrawdownPercent:-8, metricsCoverageStart:'2026-01-02', scaleNetIncreaseYi:3 },
  ] })
  assert.equal(forecast.rows.find((row) => row.id === 'money').navMedian, null)
  assert.equal(forecast.rows.find((row) => row.id === 'tech').navMedian, 12)
})

test('creates and hydrates a compact forecast snapshot', () => {
  const payload = { dataDate: '2026-09-02', updateTime: '2026-09-03T01:00:00Z', products: [{
    productId: 'p1', productName: '科技ETF', representativeCode: '000001', type: '指数型-股票',
    navGrowthPercent: 12, maxDrawdownPercent: -8, scaleNetIncreaseYi: 3,
    metricsCoverageStart: '2026-01-02', representativeShare: { dailyChangePercent: 1 },
    unusedLargeField: 'x'.repeat(1000),
  }] }
  const snapshot = createMarketForecastSnapshot(payload)
  const forecast = hydrateMarketForecastSnapshot(snapshot)
  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.updateTime, payload.updateTime)
  assert.equal(forecast.leaders.return.id, snapshot.leaderIds.return)
  assert.equal(forecast.rows.find((row) => row.id === 'tech').funds[0].unusedLargeField, undefined)
})

test('model facts exclude product arrays and remain within the API fact limit', () => {
  const products = Array.from({ length: 5000 }, (_, index) => ({
    productId: `p${index}`, productName: `科技基金${index}`, representativeCode: String(index), type: '混合型',
    navGrowthPercent: 10, maxDrawdownPercent: -5, scaleNetIncreaseYi: 1, metricsCoverageStart: '2026-01-02',
  }))
  const facts = compactMarketForecastFacts(buildMarketForecast({ dataDate: '2026-09-02', products }))
  const serialized = JSON.stringify(facts)
  assert.equal(serialized.includes('"funds"'), false)
  assert.ok(Buffer.byteLength(serialized) < 48_000)
})
