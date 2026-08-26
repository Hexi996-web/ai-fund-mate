import { useMemo, useState } from 'react'
import { ATTENTION_POOL } from '../data/attentionPool.js'

const HORIZONS = {
  quarter: { label: '未来3个月', eyebrow: '确认注意力、资金和产业信号能否连续', tone: '季度', weights: { attention:.20, validation:.45, capacity:.20, launch:.15 }, stageBoost: { '产业启动':4, '共振':2 } },
  halfYear: { label: '未来半年', eyebrow: '观察产业兑现能否带动产品需求持续扩张', tone: '半年', weights: { attention:.12, validation:.48, capacity:.30, launch:.10 }, stageBoost: { '产业启动':3, '共振':4 } },
  year: { label: '未来1年', eyebrow: '寻找可形成长期产品赛道的结构性空间', tone: '年度', weights: { attention:.05, validation:.35, capacity:.50, launch:.10 }, stageBoost: { '产业启动':2, '共振':5 } },
}

const signedYi = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '—'

function buildBrief(snapshot, horizon) {
  const definition = HORIZONS[horizon]
  const attentionCap = snapshot.attentionMaturity?.effectiveWeight ?? .05
  const attentionWeight = Math.min(definition.weights.attention,attentionCap)
  const released = definition.weights.attention-attentionWeight
  const base = definition.weights.validation+definition.weights.capacity
  const weights = {...definition.weights,attention:attentionWeight,validation:definition.weights.validation+released*(definition.weights.validation/base),capacity:definition.weights.capacity+released*(definition.weights.capacity/base)}
  const metadata = new Map(ATTENTION_POOL.map((item) => [item.id,item]))
  return (snapshot.items || []).filter((item) => item.verified && metadata.has(item.id)).map((proof) => {
    const item = metadata.get(proof.id)
    const launchScore = Math.min(100,(proof.validation.launched12Months || 0) * 6)
    const score = proof.attention.score * weights.attention + proof.validation.score * weights.validation + proof.capacity.score * weights.capacity + launchScore * weights.launch + (definition.stageBoost[item.stage] || 0)
    const evidence = horizon === 'quarter'
      ? `${proof.validation.launched12Months}只近12月新发，较2025年末规模净增加${signedYi(proof.validation.scaleNetIncreaseYi)}`
      : horizon === 'halfYear'
        ? `同类规模${proof.validation.currentScaleYi.toFixed(1)}亿元，较2025年末可比规模${pct(proof.validation.scaleGrowthPercent)}`
        : `资产承载${proof.capacity.score.toFixed(0)}分，同类规模${proof.validation.currentScaleYi.toFixed(1)}亿元`
    const analysis = horizon === 'quarter'
      ? '重点确认关注度是否持续、规模净增是否连续，以及新发是否从单点扩散为同类需求。'
      : horizon === 'halfYear'
        ? '重点核对产业兑现与产品规模扩张是否同步，排除仅由存量头部产品上涨带来的规模放大。'
        : '重点检验可投资资产容量、产品空位和产业持续性，短期热度与一次性催化不构成年度布局依据。'
    return {...item,proof,score,evidence,analysis}
  }).sort((a,b) => b.score-a.score).slice(0,3)
}

export function ResearchHorizonBrief({ snapshot, onFocus }) {
  const [horizon,setHorizon] = useState('quarter')
  const [selected,setSelected] = useState('')
  const briefs = useMemo(() => buildBrief(snapshot,horizon),[snapshot,horizon])
  const active = briefs.find((item) => item.id === selected) || briefs[0]
  const definition = HORIZONS[horizon]

  return <section className="horizon-brief" aria-label="前瞻产品方向简报">
    <header><div><h2>产品经理前瞻简报</h2><p>{definition.eyebrow}。注意力仅有{snapshot.attentionMaturity?.observedDays||0}个有效观察日，当前按{Math.round((snapshot.attentionMaturity?.effectiveWeight||.05)*100)}%上限参与排序；排序不等同发行建议。</p></div><nav aria-label="简报时间范围">{Object.entries(HORIZONS).map(([id,item])=><button type="button" className={horizon===id?'active':''} aria-pressed={horizon===id} onClick={()=>{setHorizon(id);setSelected('')}} key={id}>{item.label}</button>)}</nav></header>
    <div className="horizon-body">
      <div className="horizon-list">{briefs.map((item,index)=><button type="button" className={(active?.id===item.id?'active ':'')+`horizon-rank-${index+1}`} onClick={()=>setSelected(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><small>{definition.tone}关注</small><strong>{item.name}</strong><em>{item.evidence}</em></span><b>→</b></button>)}</div>
      {active?<article className="horizon-analysis"><div><span>{active.driver}驱动 · {active.stage}</span><strong>{active.name}</strong></div><p>{active.thesis}</p><section><small>本窗口的判断重点</small><strong>{active.analysis}</strong></section><dl className="horizon-analysis__facts"><div><dt>较2025年末可比规模净增加</dt><dd>{signedYi(active.proof.validation.scaleNetIncreaseYi)}</dd></div><div><dt>下一项验证</dt><dd>{active.validation}</dd></div></dl><button type="button" onClick={()=>onFocus(active.id)}>查看该方向完整判断 →</button></article>:<article className="horizon-analysis"><strong>数据加载中</strong></article>}
    </div>
  </section>
}
