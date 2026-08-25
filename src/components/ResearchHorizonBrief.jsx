import { useMemo, useState } from 'react'
import { ATTENTION_POOL } from '../data/attentionPool.js'

const HORIZONS = {
  month: { label: '未来1个月', eyebrow: '验证注意力能否转成资金与产品行动', tone: '近期', weights: { attention:.25, validation:.45, capacity:.15, launch:.15 }, stageBoost: {} },
  quarter: { label: '未来3个月', eyebrow: '观察规模扩张和产业验证能否连续', tone: '季度', weights: { attention:.20, validation:.55, capacity:.25, launch:0 }, stageBoost: { '产业启动':4, '共振':2 } },
  half: { label: '未来半年', eyebrow: '寻找可承载下一轮社会注意力的结构方向', tone: '中期', weights: { attention:.15, validation:.20, capacity:.40, launch:0 }, stageBoost: { '结构萌芽':9, '产业启动':7, '酝酿':5, '叙事过热':-8 } },
}

const signedYi = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '—'

function buildBrief(snapshot, horizon) {
  const definition = HORIZONS[horizon]
  const metadata = new Map(ATTENTION_POOL.map((item) => [item.id,item]))
  return (snapshot.items || []).filter((item) => item.verified && metadata.has(item.id)).map((proof) => {
    const item = metadata.get(proof.id)
    const launchScore = Math.min(100,(proof.validation.launched12Months || 0) * 6)
    const score = proof.attention.score * definition.weights.attention + proof.validation.score * definition.weights.validation + proof.capacity.score * definition.weights.capacity + launchScore * definition.weights.launch + (definition.stageBoost[item.stage] || 0)
    const evidence = horizon === 'month'
      ? `${proof.validation.launched12Months}只近12月新发，规模净变动${signedYi(proof.validation.scaleNetIncreaseYi)}`
      : horizon === 'quarter'
        ? `同类规模${proof.validation.currentScaleYi.toFixed(1)}亿元，较基准${pct(proof.validation.scaleGrowthPercent)}`
        : `${proof.capacity.boardName}流通市值${proof.capacity.floatMarketCapYi.toFixed(0)}亿元，阶段为${item.stage}`
    const analysis = horizon === 'month'
      ? '关注规模净增是否连续、新发是否从单点变成同类扩散；短期热度不能替代持续申购。'
      : horizon === 'quarter'
        ? '重点核对产品市场扩张能否与产业兑现同步，避免仅由存量头部产品上涨造成规模放大。'
        : '优先验证可投资资产是否扩容、主题收入纯度是否提高，以及结构驱动力能否穿越市场风格切换。'
    return {...item,proof,score,evidence,analysis}
  }).sort((a,b) => b.score-a.score).slice(0,3)
}

export function ResearchHorizonBrief({ snapshot, onFocus }) {
  const [horizon,setHorizon] = useState('month')
  const [selected,setSelected] = useState('')
  const briefs = useMemo(() => buildBrief(snapshot,horizon),[snapshot,horizon])
  const active = briefs.find((item) => item.id === selected) || briefs[0]
  const definition = HORIZONS[horizon]

  return <section className="horizon-brief" aria-label="前瞻产品方向简报">
    <header><div><small>产品经理前瞻简报</small><h2>未来半年，先看什么</h2><p>{definition.eyebrow}。排序随每日公开数据变化，不等同发行建议。</p></div><nav aria-label="简报时间范围">{Object.entries(HORIZONS).map(([id,item])=><button type="button" className={horizon===id?'active':''} aria-pressed={horizon===id} onClick={()=>{setHorizon(id);setSelected('')}} key={id}>{item.label}</button>)}</nav></header>
    <div className="horizon-body">
      <div className="horizon-list">{briefs.map((item,index)=><button type="button" className={(active?.id===item.id?'active ':'')+`horizon-rank-${index+1}`} onClick={()=>setSelected(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><small>{definition.tone}关注</small><strong>{item.name}</strong><em>{item.evidence}</em></span><b>→</b></button>)}</div>
      {active?<article className="horizon-analysis"><div><span>{active.driver}驱动 · {active.stage}</span><strong>{active.name}</strong></div><p>{active.thesis}</p><section><small>本窗口的判断重点</small><strong>{active.analysis}</strong></section><dl><div><dt>产品市场验证</dt><dd>{active.proof.validation.score.toFixed(1)}</dd></div><div><dt>规模净增加</dt><dd>{signedYi(active.proof.validation.scaleNetIncreaseYi)}</dd></div><div><dt>下一项验证</dt><dd>{active.validation}</dd></div></dl><button type="button" onClick={()=>onFocus(active.id)}>在热力图中查看 →</button></article>:<article className="horizon-analysis"><strong>数据加载中</strong></article>}
    </div>
  </section>
}
