import { ATTENTION_POOL } from './attentionPool.js'

export const HORIZON_IDS = ['quarter', 'halfYear', 'year']
const clamp = (value) => Math.min(100, Math.max(0, Number(value) || 0))
const average = (rows) => rows.length ? rows.reduce((sum, row) => sum + (Number(row.views) || 0), 0) / rows.length : 0

function wikiScore(signal) {
  const rows = signal?.wikimedia?.daily || []
  if (rows.length < 90) return 50
  const change30 = average(rows.slice(-30)) / Math.max(1, average(rows.slice(-60, -30))) - 1
  const change90 = average(rows.slice(-45)) / Math.max(1, average(rows.slice(-90, -45))) - 1
  return clamp(50 + 25 * Math.tanh(change30 / .35) + 25 * Math.tanh(change90 / .45))
}

function enterpriseScore(row) {
  const enterprise = row?.enterprise
  if (!enterprise || enterprise.status !== '真实公开数据') return 50
  return clamp(clamp(50 + (enterprise.revenueGrowthMedian || 0) * 1.2) * .30 + clamp(50 + (enterprise.profitGrowthMedian || 0)) * .20 + (enterprise.positiveRevenueShare || 0) * .25 + (enterprise.positiveProfitShare || 0) * .25)
}

function structureScore(row) {
  const history = row?.structure?.history || []
  if (history.length < 2) return 50
  const first = Number(history[0].value ?? history[0].index ?? 0)
  const last = Number(history.at(-1).value ?? history.at(-1).index ?? 0)
  return first ? clamp(50 + (last / first - 1) * 100) : 50
}

function gapScore(proof) {
  const parts = proof.validation.scoreComponents || {}
  return clamp((100 - (parts.newLaunches || 0)) * .45 + (100 - (parts.effectiveProducts || 0)) * .35 + (parts.concentrationBalance || 50) * .20)
}

export function buildRankedDirections(snapshot, horizon, evidenceItems = [], externalItems = []) {
  const metadata = new Map(ATTENTION_POOL.map((item) => [item.id, item]))
  const evidence = new Map(evidenceItems.map((item) => [item.id, item]))
  const external = new Map(externalItems.map((item) => [item.id, item]))
  const history = snapshot.rankingHistory || []
  const latestRanks = new Map((history.at(-1)?.horizonRankedIds?.[horizon] || []).map((id, index) => [id, index + 1]))
  const previousRanks = new Map((history.at(-2)?.horizonRankedIds?.[horizon] || []).map((id, index) => [id, index + 1]))
  return (snapshot.items || []).filter((proof) => proof.verified && metadata.has(proof.id)).map((proof) => {
    const item = metadata.get(proof.id)
    const parts = proof.validation.scoreComponents || {}
    const wiki = wikiScore(external.get(proof.id))
    const enterprise = enterpriseScore(evidence.get(proof.id))
    const structure = structureScore(evidence.get(proof.id))
    const gap = gapScore(proof)
    const liveAttention = proof.attention.score
    const flow = parts.estimatedNetFlow || 0
    const breadth = parts.growthBreadth || 0
    const growth = parts.scaleGrowthRate || 0
    let score
    let evidenceText
    if (horizon === 'quarter') {
      score = liveAttention * .10 + wiki * .20 + flow * .35 + breadth * .20 + (parts.newLaunches || 0) * .15
      evidenceText = `注意力${liveAttention.toFixed(0)} · 资金流${flow.toFixed(0)} · 广度${breadth.toFixed(0)}`
    } else if (horizon === 'halfYear') {
      score = enterprise * .40 + structure * .15 + growth * .20 + breadth * .15 + flow * .10
      evidenceText = `企业兑现${enterprise.toFixed(0)} · 增速${growth.toFixed(0)} · 广度${breadth.toFixed(0)}`
    } else {
      score = proof.capacity.score * .30 + enterprise * .25 + wiki * .15 + gap * .20 + structure * .10
      evidenceText = `容量${proof.capacity.score.toFixed(0)} · 企业兑现${enterprise.toFixed(0)} · 空位${gap.toFixed(0)}`
    }
    const latestRank = latestRanks.get(item.id)
    const previousRank = previousRanks.get(item.id)
    return { ...item, proof, score, evidence: evidenceText, rankDelta: latestRank && previousRank ? previousRank - latestRank : 0 }
  }).sort((a, b) => b.score - a.score)
}
