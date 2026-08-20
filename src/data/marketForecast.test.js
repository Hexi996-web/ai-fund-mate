import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMarketForecast } from './marketForecast.js'

test('builds forecast metrics from the daily product payload', () => {
  const product = (name, type, nav, drawdown, scale, daily = 1) => ({
    productName: name, type, navGrowthPercent: nav, maxDrawdownPercent: drawdown,
    scaleNetIncreaseYi: scale, representativeShare: { dailyChangePercent: daily },
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
