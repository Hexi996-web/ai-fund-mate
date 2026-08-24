import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMarketForecast } from './marketForecast.js'

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
