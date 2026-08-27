import { useMemo, useState } from 'react'
import { ATTENTION_POOL } from '../data/attentionPool.js'

const HORIZONS = {
  quarter: { label:'未来3个月', tone:'短期催化', eyebrow:'捕捉注意力加速是否得到资金与产品需求确认' },
  halfYear: { label:'未来半年', tone:'产业兑现', eyebrow:'检验企业兑现能否转化为持续的产品需求' },
  year: { label:'未来1年', tone:'赛道形成', eyebrow:'寻找长期认知、资产容量与产品空位的共同交集' },
}
const clamp = (value) => Math.min(100,Math.max(0,Number(value)||0))
const average = (rows) => rows.length ? rows.reduce((sum,row)=>sum+(Number(row.views)||0),0)/rows.length : 0
const signedYi = (value) => Number.isFinite(value) ? `${value>=0?'+':''}${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value>=0?'+':''}${value.toFixed(1)}%` : '—'

function wikiScore(signal) {
  const rows=signal?.wikimedia?.daily||[]
  if(rows.length<90)return 50
  const change30=average(rows.slice(-30))/Math.max(1,average(rows.slice(-60,-30)))-1
  const change90=average(rows.slice(-45))/Math.max(1,average(rows.slice(-90,-45)))-1
  return clamp(50+25*Math.tanh(change30/.35)+25*Math.tanh(change90/.45))
}
function enterpriseScore(row) {
  const enterprise=row?.enterprise
  if(!enterprise || enterprise.status!=='真实公开数据')return 50
  return clamp(clamp(50+(enterprise.revenueGrowthMedian||0)*1.2)*.30+clamp(50+(enterprise.profitGrowthMedian||0))*.20+(enterprise.positiveRevenueShare||0)*.25+(enterprise.positiveProfitShare||0)*.25)
}
function structureScore(row) {
  const history=row?.structure?.history||[]
  if(history.length<2)return 50
  const first=Number(history[0].value??history[0].index??0),last=Number(history.at(-1).value??history.at(-1).index??0)
  return first ? clamp(50+(last/first-1)*100) : 50
}
function gapScore(proof) {
  const parts=proof.validation.scoreComponents||{}
  return clamp((100-(parts.newLaunches||0))*.45+(100-(parts.effectiveProducts||0))*.35+(parts.concentrationBalance||50)*.20)
}

function buildBrief(snapshot,horizon,evidenceItems,externalItems) {
  const metadata=new Map(ATTENTION_POOL.map((item)=>[item.id,item]))
  const evidence=new Map(evidenceItems.map((item)=>[item.id,item]))
  const external=new Map(externalItems.map((item)=>[item.id,item]))
  return (snapshot.items||[]).filter((proof)=>proof.verified&&metadata.has(proof.id)).map((proof)=>{
    const item=metadata.get(proof.id),parts=proof.validation.scoreComponents||{}
    const wiki=wikiScore(external.get(proof.id)),enterprise=enterpriseScore(evidence.get(proof.id)),structure=structureScore(evidence.get(proof.id)),gap=gapScore(proof)
    const liveAttention=proof.attention.score,flow=parts.estimatedNetFlow||0,breadth=parts.growthBreadth||0,growth=parts.scaleGrowthRate||0
    let score,evidenceText,analysis
    if(horizon==='quarter'){
      score=liveAttention*.10+wiki*.20+flow*.35+breadth*.20+(parts.newLaunches||0)*.15
      evidenceText=`注意力${liveAttention.toFixed(0)} · 长期认知${wiki.toFixed(0)} · 资金流${flow.toFixed(0)}`
      analysis='观察注意力是否持续扩散，并由同类产品净流入和增长广度确认；单日热榜不直接形成推荐。'
    }else if(horizon==='halfYear'){
      score=enterprise*.40+structure*.15+growth*.20+breadth*.15+flow*.10
      evidenceText=`企业兑现${enterprise.toFixed(0)} · 规模增速${growth.toFixed(0)} · 增长广度${breadth.toFixed(0)}`
      analysis='观察龙头收入、利润与产业需求是否连续两个报告期改善，并与产品规模扩张同步。'
    }else{
      score=proof.capacity.score*.30+enterprise*.25+wiki*.15+gap*.20+structure*.10
      evidenceText=`资产容量${proof.capacity.score.toFixed(0)} · 企业兑现${enterprise.toFixed(0)} · 产品空位${gap.toFixed(0)}`
      analysis='检验资产池能否长期承载、公众认知能否沉淀，以及现有产品供给是否仍保留有效空位。'
    }
    return {...item,proof,score,evidence:evidenceText,analysis}
  }).sort((a,b)=>b.score-a.score).slice(0,3)
}

export function ResearchHorizonBrief({ snapshot,onOpen,evidenceItems=[],externalItems=[],productIds=[] }) {
  const [horizon,setHorizon]=useState('quarter'),[selected,setSelected]=useState('')
  const briefs=useMemo(()=>buildBrief(snapshot,horizon,evidenceItems,externalItems),[snapshot,horizon,evidenceItems,externalItems])
  const active=briefs.find((item)=>item.id===selected)||briefs[0],definition=HORIZONS[horizon]
  const productSet=useMemo(()=>new Set(productIds),[productIds])
  return <section className="horizon-brief" aria-label="前瞻产品方向简报">
    <header><div><h2>产品经理前瞻简报</h2><p>{definition.eyebrow}。三个期限分别排序，排序不等同发行建议。</p></div><nav aria-label="简报时间范围">{Object.entries(HORIZONS).map(([id,item])=><button type="button" className={horizon===id?'active':''} aria-pressed={horizon===id} onClick={()=>{setHorizon(id);setSelected('')}} key={id}>{item.label}</button>)}</nav></header>
    <div className="horizon-body"><div className="horizon-list">{briefs.map((item,index)=><button type="button" className={(active?.id===item.id?'active ':'')+`horizon-rank-${index+1}`} onClick={()=>onOpen(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><small>{definition.tone}</small><strong>{item.name}</strong><em>{item.evidence}</em></span><b>查看</b></button>)}</div>
      {active?<article className="horizon-analysis"><div><span>{active.driver}驱动 · {definition.tone}</span><strong>{active.name}</strong><em className={productSet.has(active.id)?'is-product':'is-watch'}>{productSet.has(active.id)?'核心产品池':'母池观察'}</em></div><p>{active.thesis}</p><section><small>该期限重点判断</small><strong>{active.analysis}</strong></section><dl className="horizon-analysis__facts"><div><dt>较2025年末规模净增加</dt><dd>{signedYi(active.proof.validation.scaleNetIncreaseYi)}</dd></div><div><dt>可比规模增幅</dt><dd>{pct(active.proof.validation.scaleGrowthPercent)}</dd></div></dl><button type="button" onClick={()=>onOpen(active.id)}>打开方向详情 →</button></article>:<article className="horizon-analysis"><strong>数据加载中</strong></article>}
    </div>
  </section>
}
