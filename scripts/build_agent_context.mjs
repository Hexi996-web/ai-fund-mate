import fs from 'node:fs'
import path from 'node:path'
import { ATTENTION_POOL } from '../src/data/attentionPool.js'
import { buildRankedDirections } from '../src/data/horizonRanking.js'

const publicDir = path.resolve('public')
const read = (name) => JSON.parse(fs.readFileSync(path.join(publicDir, name), 'utf8'))
const byId = new Map(ATTENTION_POOL.map((item) => [item.id, item]))
const round = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null

const status = read('data_status.json')
const attention = read('attention_pool_evidence.json')
const products = read('fund_products.json')
const issuance = read('issuance_insights.json')
const preResearch = read('pre_research_evidence.json')
const externalSignals = read('theme_external_signals.json')

const horizonLabels = { quarter: '未来3个月', halfYear: '未来半年', year: '未来1年' }
const horizonRankings = Object.fromEntries(Object.entries(horizonLabels).map(([id, label]) => {
  const rows = buildRankedDirections(attention, id, preResearch.items || [], externalSignals.items || [])
  return [id, {
    label,
    top10: rows.slice(0, 10).map(({ id: themeId, name, score, rankDelta, evidence }) => ({
      id: themeId,
      name,
      score: round(score),
      rankDelta,
      evidence,
    })),
  }]
}))

const pageKnowledge = {
  scope: '解释当前页面全部可见结论、图表、榜单、交互、数据来源、计算口径、更新时间与局限；回答当前数值时优先使用workspaces中的快照。',
  dates: {
    dataDate: status.snapshotDate,
    websiteUpdatedAt: status.generatedAt,
    fundSnapshotUpdatedAt: status.productsUpdateTime,
    attentionUpdatedAt: status.attentionGeneratedAt,
    rule: '数据日期表示底层观测对应哪一天；更新时间表示网站或数据文件何时生成，两者不得混用。',
  },
  quadrant: {
    verticalAxis: '综合关注与认知（0—100）：短中期国内公开热榜基础信号与长期公众认知信号；当前长期信号包含Wikimedia趋势。统一基础信号占70%，产业差异信号占30%；未接入来源按50分中性处理，不重分配权重。',
    horizontalAxis: '综合产品机会（0—100）：产业核心需求40%＋基金产品市场40%＋龙头企业兑现20%。',
    bubbleSize: '资产承载分决定圆点大小；蓝色外圈表示当前核心10。',
    threshold: '横纵轴均以50分为四象限分界。',
    quadrants: {
      '关注领先区': '关注≥50、产品机会<50；先核验热点能否从事件脉冲转为持续扩散。',
      '机会—关注共振区': '关注≥50、产品机会≥50；两项同时增强，同时检查产品供给拥挤和关注见顶风险。',
      '潜在方向观察区': '关注<50、产品机会<50；仅在结构性证据成立时保留观察。',
      '提前预研区': '关注<50、产品机会≥50；产业和产品证据先行，继续观察公众认知是否破圈。',
    },
  },
  rankingRules: {
    core10: '核心排名总分＝产业核心需求20%＋基金产品市场20%＋龙头企业兑现10%＋综合关注与认知25%＋资产承载20%＋风险韧性5%。核心10原则上按季度重排；重大政策、技术或企业证伪可触发临时复核。',
    quarter: '未来3个月＝实时注意力10%＋长期认知20%＋估算资金流35%＋规模增长广度20%＋近12个月新发15%。',
    halfYear: '未来半年＝龙头企业兑现40%＋产业结构趋势15%＋同类规模增速20%＋规模增长广度15%＋估算资金流10%。',
    year: '未来1年＝资产承载30%＋龙头企业兑现25%＋长期公众认知15%＋产品供给空位20%＋产业结构趋势10%。',
    updateCadence: '期限榜单随每日基金主快照重算并保存历史；社会注意力可更高频采集，但不会单独重复调用大模型生成日报。',
    arrows: '箭头比较当前期与上一期同一期限榜单的名次：rankDelta＝上一期名次－当前名次；正数为上升，负数为下降，0为持平或缺少可比历史。不同期限之间不互相比较。',
  },
  dataProcessing: {
    fundProducts: 'A/C等份额先合并为产品；规模优先使用可核验公开规模或份额×净值估算；规模净增按当前规模减2025年末同口径规模计算。主题间可能重叠，因此主题规模不能简单相加，也不等同净申购。',
    demand: '产业需求使用多指标合同，以50为中性基准；基础权重再按来源质量、新鲜度和连续性折算为有效权重，缺失指标不重新分配。',
    attention: '短中期热点与长期认知分层保存；来源缺失按中性值处理，避免仅因抓取失败而夸大其他来源。',
    history: 'GitHub只保留当前网站快照和精简回退数据；完整历史明细写入Supabase PostgreSQL，用于趋势、历史比较和策略验证。',
    aiBoundary: '排名、指标和可复算事实由确定性程序生成；大模型只在每日主更新后生成整体判断、变化归因、风险提示和跟踪建议，不负责改写原始数值。',
  },
}

const research = attention.recommendedIds.map((id, index) => {
  const evidence = attention.items.find((item) => item.id === id) || {}
  const theme = byId.get(id) || {}
  const opportunity = evidence.opportunityModel || {}
  return {
    rank: index + 1,
    id,
    name: theme.name || evidence.query || id,
    attention: round(evidence.attention?.score ?? evidence.attention?.compositeScore),
    productValidation: round(evidence.validation?.score),
    opportunityScore: round(opportunity.opportunityScore),
    opportunityComponents: opportunity.components ? {
      industryDemand: round(opportunity.components.industryDemand),
      productMarket: round(opportunity.components.productMarket),
      enterpriseDelivery: round(opportunity.components.enterpriseDelivery),
    } : null,
    coreRankingScore: round(opportunity.totalScore),
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
  pageKnowledge,
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
      horizonRankings,
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
