import fs from 'node:fs'
import path from 'node:path'
import { ATTENTION_POOL } from '../src/data/attentionPool.js'

const publicDir = path.resolve('public')
const read = (name) => JSON.parse(fs.readFileSync(path.join(publicDir, name), 'utf8'))
const byId = new Map(ATTENTION_POOL.map((item) => [item.id, item]))
const round = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null

const status = read('data_status.json')
const attention = read('attention_pool_evidence.json')
const products = read('fund_products.json')
const issuance = read('issuance_insights.json')

const research = attention.recommendedIds.map((id, index) => {
  const evidence = attention.items.find((item) => item.id === id) || {}
  const theme = byId.get(id) || {}
  return {
    rank: index + 1,
    id,
    name: theme.name || evidence.query || id,
    attention: round(evidence.attention?.score ?? evidence.attention?.compositeScore),
    productValidation: round(evidence.validation?.score),
    assetCapacity: round(evidence.capacity?.score),
    lifecycleState: evidence.lifecycle?.state || null,
    lifecycleReason: evidence.lifecycle?.reason || null,
    marketConclusion: theme.supply?.conclusion || null,
  }
})

const typeMap = new Map()
let currentScaleYi = 0
let baselineScaleYi = 0
let comparableCount = 0
for (const product of products.products || []) {
  const type = product.type || '未分类'
  const row = typeMap.get(type) || { type, count: 0, currentScaleYi: 0 }
  row.count += 1
  row.currentScaleYi += Number(product.currentScaleYi) || 0
  typeMap.set(type, row)
  if (Number.isFinite(Number(product.currentScaleYi)) && Number.isFinite(Number(product.baselineScaleYi))) {
    currentScaleYi += Number(product.currentScaleYi)
    baselineScaleYi += Number(product.baselineScaleYi)
    comparableCount += 1
  }
}

const output = {
  schemaVersion: 2,
  generatedAt: status.generatedAt,
  snapshotDate: status.snapshotDate,
  workspaces: {
    '预研产品池': {
      universeCount: attention.universeCount,
      observationDays: attention.attentionObservationDays,
      reviewQuarter: attention.recommendationReviewQuarter,
      coreDirections: research,
      modelCalibration: attention.modelCalibration ? {
        modelVersion: attention.modelCalibration.modelVersion,
        oldestForecastDate: attention.modelCalibration.oldestForecastDate,
        quarterlyCohorts: attention.modelCalibration.quarterlyCohorts,
        horizons: attention.modelCalibration.horizons.map(({ label, status, evaluable, hitRatePercent, inclusiveHitRatePercent }) => ({ label, status, evaluable, hitRatePercent, inclusiveHitRatePercent })),
      } : null,
    },
    '公募基金简报': {
      productTotal: products.productTotal,
      shareTotal: products.shareTotal,
      comparableProductCount: comparableCount,
      comparableCurrentScaleYi: round(currentScaleYi),
      comparableBaselineScaleYi: round(baselineScaleYi),
      scaleNetIncreaseYi: round(currentScaleYi - baselineScaleYi),
      leadingTypes: [...typeMap.values()].sort((a, b) => b.currentScaleYi - a.currentScaleYi).slice(0, 8).map((row) => ({ ...row, currentScaleYi: round(row.currentScaleYi) })),
      issuance: { dataDate: issuance.dataDate, summary: issuance.summary, sourceStatus: issuance.sourceStatus },
    },
    '行情预测': {
      snapshotDate: status.snapshotDate,
      productsUpdateTime: status.productsUpdateTime,
      researchCoreDirections: research.slice(0, 10),
      note: '行情判断联合使用同口径基金收益、回撤、规模变化、发行数据与预研产品池核心方向；回答时须说明具体比较区间。',
    },
  },
}

fs.writeFileSync(path.join(publicDir, 'agent_context.json'), `${JSON.stringify(output)}\n`)
console.log(`Agent context generated for ${output.snapshotDate}`)
