import { useEffect, useMemo, useState } from 'react'
import { ATTENTION_POOL } from '../data/attentionPool.js'

const DRIVERS = ['全部','技术','人口','健康','能源','资源','安全','消费','环境']
const plotPosition = (value) => Math.min(87, Math.max(13, value))
const quadrantClass = (attention, market) => attention >= 50 ? (market >= 50 ? 'resonance' : 'lead') : (market >= 50 ? 'risk' : 'seed')
const yi = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'

const average = (rows) => rows.length ? rows.reduce((sum, row) => sum + (Number(row.views) || 0), 0) / rows.length : 0
const clampScore = (value) => Math.min(100, Math.max(0, value))

function wikimediaSignal(signal) {
  const rows = signal?.wikimedia?.daily || []
  if (rows.length < 90) return { score: null, label: '历史不足', change30: null }
  const recent30 = average(rows.slice(-30))
  const prior30 = average(rows.slice(-60, -30))
  const recent45 = average(rows.slice(-45))
  const prior45 = average(rows.slice(-90, -45))
  const change30 = prior30 ? (recent30 / prior30 - 1) * 100 : 0
  const change90 = prior45 ? (recent45 / prior45 - 1) * 100 : 0
  const score = clampScore(50 + 25 * Math.tanh(change30 / 35) + 25 * Math.tanh(change90 / 45))
  const label = score >= 62 ? '长期认知升温' : score <= 38 ? '长期认知降温' : '长期认知平稳'
  return { score, label, change30 }
}

function CandidateDetail({ item, onSelectCore, hasProduct }) {
  if (!item) return null
  return <aside className="attention-detail">
    <div><small>{item.driver}驱动 · {item.proof?.attention.statusLabel || '待验证'}</small><strong>{item.name}</strong><span>{item.bucket}</span></div>
    <p>{item.thesis}</p>
    {item.proof?<p className="attention-proof">数据：{item.proof.attention.source} · {item.proof.validation.source} · {item.proof.capacity.boardName || item.proof.capacity.source}（主题代理）· {item.proof.validation.asOf}</p>:<p className="attention-proof">待完成公开注意力、基金市场和可投资资产的统一映射，暂不生成坐标。</p>}
    <dl><div><dt>综合关注与认知</dt><dd>{item.proof?item.attention.toFixed(1):'—'}</dd></div><div><dt>综合产品机会</dt><dd>{item.proof?item.industry:'—'}</dd></div><div><dt>资产承载</dt><dd>{item.proof?item.capacity:'—'}</dd></div></dl>
    {item.opportunity ? <div className="attention-breakdowns"><details><summary>综合产品机会构成</summary><div><span><small>产业核心需求 · 40%</small><b>{item.opportunity.components.industryDemand}</b></span><span><small>基金产品市场 · 40%</small><b>{item.opportunity.components.productMarket}</b></span><span><small>龙头企业兑现 · 20%</small><b>{item.opportunity.components.enterpriseDelivery}</b></span><span><small>核心排名总分</small><b>{item.opportunity.totalScore}</b></span></div></details></div> : null}
    {item.proof && item.wiki.score !== null ? <div className="attention-wiki-score"><div><small>国内短中期基础信号</small><strong>{item.rawAttention.toFixed(1)}</strong></div><div><small>长期公众认知信号</small><strong>{item.wiki.score.toFixed(1)}</strong></div><p><b>{item.wiki.label}</b><span>近30日较前30日 {item.wiki.change30 >= 0 ? '+' : ''}{item.wiki.change30.toFixed(1)}% · 综合分采用统一基础70%＋产业差异30%</span></p></div> : null}
    {item.proof?<div className="attention-breakdowns"><details><summary>社会注意力</summary><div><span><small>近7日上榜次数</small><b>{item.proof.attention.recent7Appearances ?? 0}次</b></span><span><small>近30日上榜次数</small><b>{item.proof.attention.recent30Appearances ?? 0}次</b></span><span><small>近30日活跃天数</small><b>{item.proof.attention.activeDays30d ?? 0}天</b></span><span><small>双平台同时上榜</small><b>{item.proof.attention.crossPlatformHits30d ?? 0}次</b></span></div></details><details><summary>同类基金市场表现</summary><div><span><small>估算资金净增</small><b>{yi(item.proof.validation.estimatedNetFlowYi)}</b></span><span><small>较2025年末规模净增</small><b>{yi(item.proof.validation.scaleNetIncreaseYi)}</b></span><span><small>可比规模增幅</small><b>{pct(item.proof.validation.scaleGrowthPercent)}</b></span><span><small>规模增长产品占比</small><b>{pct(item.proof.validation.growthBreadthPercent)}</b></span><span><small>可比产品数量</small><b>{item.proof.validation.effectiveFunds ?? 0}只</b></span><span><small>最大产品规模占比</small><b>{pct(item.proof.validation.top1SharePercent)}</b></span></div></details></div>:null}
    <section><small>下一项关键验证</small><strong>{item.validation}</strong></section>
    <footer>{hasProduct ? <button type="button" onClick={() => onSelectCore(item.id)}>查看完整产品判断 →</button> : <span>{item.bucket === '核心10' ? '已进入核心10，完整产品映射正在补充' : '母池观察：继续验证产业兑现与产品时点'}</span>}</footer>
  </aside>
}

export function AttentionHeatmap({ onSelectCore, focusId = '', externalSignals = [], productIds = [], snapshot }) {
  const [driver,setDriver] = useState('全部')
  const [selectedId,setSelectedId] = useState('industrial-software')
  const [showLabels,setShowLabels] = useState(false)
  const evidenceSnapshot = snapshot || {items:[],verifiedCount:0,universeCount:ATTENTION_POOL.length,recommendedIds:[],generatedAt:''}
  useEffect(()=>{if(focusId)setSelectedId(focusId)},[focusId])
  const candidates = useMemo(()=>{
    const evidence = new Map((evidenceSnapshot.items||[]).filter((item)=>item.verified).map((item)=>[item.id,item]))
    const signals = new Map(externalSignals.map((item)=>[item.id,item]))
    const recommended = new Set(evidenceSnapshot.recommendedIds||[])
    return ATTENTION_POOL.map((item)=>{
      const proof=evidence.get(item.id)
      if (!proof) return {...item,bucket:'待数据映射',proof:null}
      const rawAttention = proof.attention.score
      const wiki = wikimediaSignal(signals.get(item.id))
      const opportunity = proof.opportunityModel
      const attention = opportunity?.attentionScore ?? (wiki.score === null ? rawAttention : rawAttention * .8 + wiki.score * .2)
      return {...item,bucket:recommended.has(item.id)?'核心10':'接近入池',attention,rawAttention,wiki,industry:opportunity?.opportunityScore ?? proof.validation.score,capacity:proof.capacity.score,opportunity,proof}
    })
  },[evidenceSnapshot.items,evidenceSnapshot.recommendedIds,externalSignals])
  const visible = useMemo(() => driver === '全部' ? candidates : candidates.filter((item)=>item.driver===driver),[candidates,driver])
  const plotted = visible.filter((item)=>item.proof)
  const pending = visible.filter((item)=>!item.proof)
  const active = candidates.find((item)=>item.id===selectedId) || visible[0] || candidates[0]
  return <section className="attention-section" aria-label="未来社会注意力方向热力图">
    <header className="attention-head"><div><p>母池36个方向全部展示：{evidenceSnapshot.verifiedCount||0}个使用公开数据坐标。纵轴为综合关注与认知，横轴为综合产品机会（产业核心需求40%＋基金产品市场40%＋龙头企业兑现20%）；蓝色外圈表示核心10。</p></div><div className="attention-legend"><span><i className="legend-lead"/>关注领先</span><span><i className="legend-resonance"/>机会—关注共振</span><span><i className="legend-seed"/>潜在方向观察</span><span><i className="legend-risk"/>提前预研</span><span><i className="legend-core"/>核心10外圈</span></div></header>
    <div className="attention-toolbar" aria-label="候选池筛选"><div>{DRIVERS.map((item)=><button type="button" className={driver===item?'active':''} onClick={()=>setDriver(item)} key={item}>{item}</button>)}</div><label><input type="checkbox" checked={showLabels} onChange={(event)=>setShowLabels(event.target.checked)}/> 显示名称</label></div>
    <div className="attention-grid">
        <div className="attention-canvas">
        <div className="quadrant quadrant--lead"><b>关注领先区</b><strong>关注先于产品机会；先核验是否从事件脉冲转为持续扩散</strong></div>
        <div className="quadrant quadrant--resonance"><b>机会—关注共振区</b><strong>两项同时增强；重点防范供给拥挤与关注见顶</strong></div>
        <div className="quadrant quadrant--seed"><b>潜在方向观察区</b><strong>两项验证均弱；仅在结构证据成立时继续保留</strong></div>
        <div className="quadrant quadrant--risk"><b>提前预研区</b><strong>产品机会先行；检查关注是否可能随后破圈</strong></div>
        <div className="attention-zero-band"><span>未破圈观察带 · 尚未进入百度／头条热榜</span></div>
        {plotted.map((item)=><button type="button" aria-label={`${item.name}，综合关注与认知${item.attention}，综合产品机会${item.industry}`} title={item.name} className={`attention-dot attention-dot--${quadrantClass(item.attention,item.industry)} ${item.attention<=10?'is-low':''} ${item.bucket==='核心10'?'is-core':''} ${selectedId===item.id?'is-active':''}`} style={{left:`${plotPosition(item.industry)}%`,bottom:`${plotPosition(item.attention)}%`,width:`${18+item.capacity*.18}px`,height:`${18+item.capacity*.18}px`}} onClick={()=>setSelectedId(item.id)} key={item.id}>{showLabels || selectedId===item.id ? <span>{item.name}</span> : null}</button>)}
        <div className="attention-midline attention-midline--x"/><div className="attention-midline attention-midline--y"/>
      </div>
      {pending.length?<div className="attention-pending"><div><strong>待数据映射 · {pending.length}</strong><small>保留在母池，不参与坐标与核心10排序</small></div><section>{pending.map((item)=><button type="button" className={selectedId===item.id?'active':''} onClick={()=>setSelectedId(item.id)} key={item.id}><i/>{item.name}</button>)}</section></div>:null}
      {active?<CandidateDetail item={active} onSelectCore={onSelectCore} hasProduct={productIds.includes(active.id)}/>:<aside className="attention-detail attention-detail--empty"><strong>真实数据校验中</strong><p>当前没有同时通过社会注意力、产品市场验证与资产承载三项校验的方向，因此不绘制模拟坐标。</p></aside>}
    </div>
  </section>
}
