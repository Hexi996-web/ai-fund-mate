import { useMemo, useState } from 'react'
import { ATTENTION_POOL } from '../data/attentionPool.js'

const HORIZONS = {
  quarter: { label:'未来3个月', tone:'短期验证', stance:'保持预研、暂不扩大立项', conclusion:'产品与资金验证仍强，但公众注意力只在少数方向形成持续扩散。未来三个月更适合验证存量方向，而非追逐新增热点。', action:'仅在资金连续性与注意力持续性同时满足时升级立项。' },
  halfYear: { label:'未来半年', tone:'兑现跟踪', stance:'聚焦兑现、收缩纯叙事方向', conclusion:'半年窗口应把企业收入、订单与同类产品资金流放在同一证据链中，优先保留能够连续兑现的方向。', action:'把连续两个报告期的经营改善作为扩池前置条件。' },
  year: { label:'未来1年', tone:'结构布局', stance:'保留结构机会、等待产品空位', conclusion:'一年窗口更关注资产容量、长期认知与产品供给空位，避免把短期热度直接外推为长期产品机会。', action:'优先研究资产承载充分且同类供给尚未拥挤的方向。' },
}
const clamp = (value) => Math.min(100,Math.max(0,Number(value)||0))
const average = (rows) => rows.length ? rows.reduce((sum,row)=>sum+(Number(row.views)||0),0)/rows.length : 0
const signedYi = (value) => Number.isFinite(value) ? `${value>=0?'+':''}${value.toFixed(1)}亿元` : '—'
const signedPct = (value) => Number.isFinite(value) ? `${value>=0?'+':''}${value.toFixed(1)}%` : '—'

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

function buildRankedDirections(snapshot,horizon,evidenceItems,externalItems) {
  const metadata=new Map(ATTENTION_POOL.map((item)=>[item.id,item]))
  const evidence=new Map(evidenceItems.map((item)=>[item.id,item]))
  const external=new Map(externalItems.map((item)=>[item.id,item]))
  const history=snapshot.rankingHistory||[],latest=history.at(-1),previous=history.at(-2)
  const latestRanks=new Map((latest?.rankedIds||[]).map((id,index)=>[id,index+1]))
  const previousRanks=new Map((previous?.rankedIds||[]).map((id,index)=>[id,index+1]))
  return (snapshot.items||[]).filter((proof)=>proof.verified&&metadata.has(proof.id)).map((proof)=>{
    const item=metadata.get(proof.id),parts=proof.validation.scoreComponents||{}
    const wiki=wikiScore(external.get(proof.id)),enterprise=enterpriseScore(evidence.get(proof.id)),structure=structureScore(evidence.get(proof.id)),gap=gapScore(proof)
    const liveAttention=proof.attention.score,flow=parts.estimatedNetFlow||0,breadth=parts.growthBreadth||0,growth=parts.scaleGrowthRate||0
    let score,evidenceText
    if(horizon==='quarter'){
      score=liveAttention*.10+wiki*.20+flow*.35+breadth*.20+(parts.newLaunches||0)*.15
      evidenceText=`注意力${liveAttention.toFixed(0)} · 资金流${flow.toFixed(0)} · 广度${breadth.toFixed(0)}`
    }else if(horizon==='halfYear'){
      score=enterprise*.40+structure*.15+growth*.20+breadth*.15+flow*.10
      evidenceText=`企业兑现${enterprise.toFixed(0)} · 增速${growth.toFixed(0)} · 广度${breadth.toFixed(0)}`
    }else{
      score=proof.capacity.score*.30+enterprise*.25+wiki*.15+gap*.20+structure*.10
      evidenceText=`容量${proof.capacity.score.toFixed(0)} · 企业兑现${enterprise.toFixed(0)} · 空位${gap.toFixed(0)}`
    }
    const latestRank=latestRanks.get(item.id),previousRank=previousRanks.get(item.id)
    return {...item,proof,score,evidence:evidenceText,rankDelta:latestRank&&previousRank?previousRank-latestRank:0}
  }).sort((a,b)=>b.score-a.score)
}

function median(values) {
  const sorted=values.filter(Number.isFinite).toSorted((a,b)=>a-b)
  if(!sorted.length)return 0
  const middle=Math.floor(sorted.length/2)
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2
}

function buildPoolBrief(ranked,horizon,rankingHistory=[]) {
  const definition=HORIZONS[horizon],top=ranked.slice(0,10)
  const positiveScale=top.filter(({proof})=>Number(proof.validation.scaleNetIncreaseYi)>0).length
  const crowded=top.filter(({proof})=>proof.lifecycle?.state==='拥挤观察').length
  const attentionReady=top.filter(({proof})=>Number(proof.attention.score)>=50).length
  const growthMedian=median(top.map(({proof})=>Number(proof.validation.scaleGrowthPercent)))
  const scaleLeaders=top.toSorted((a,b)=>(Number(b.proof.validation.scaleNetIncreaseYi)||0)-(Number(a.proof.validation.scaleNetIncreaseYi)||0)).slice(0,3)
  const scaleLeaderText=scaleLeaders.map(({name,proof})=>`${name}（${signedYi(Number(proof.validation.scaleNetIncreaseYi))}）`).join('、')
  const crowdedDirections=top.filter(({proof})=>proof.lifecycle?.state==='拥挤观察')
  const latestHistory=rankingHistory.at(-1),previousHistory=rankingHistory.at(-2)
  const latestTop=(latestHistory?.rankedIds||[]).slice(0,10),previousTop=(previousHistory?.rankedIds||[]).slice(0,10)
  const entered=latestTop.filter((id)=>!previousTop.includes(id)).map((id)=>ATTENTION_POOL.find((item)=>item.id===id)).filter(Boolean)
  const exited=previousTop.filter((id)=>!latestTop.includes(id)).map((id)=>ATTENTION_POOL.find((item)=>item.id===id)).filter(Boolean)
  const dataDate=top[0]?.proof?.capacity?.asOf||String(top[0]?.proof?.validation?.asOf||'—').slice(0,10)
  return {...definition,dataDate,total:top.length,positiveScale,crowded,attentionReady,growthMedian,scaleLeaderText,scaleLeaders,crowdedDirections,entered,exited,previousDate:previousHistory?.date,rankingCount:rankingHistory.length,metrics:[
    {id:'scale',label:'规模净增最快',items:scaleLeaders.map(({name,proof})=>({name,value:signedYi(Number(proof.validation.scaleNetIncreaseYi))})),detail:`按各方向同类产品当前规模减去2025年末同口径规模排序。当前前三为：${scaleLeaderText}。主题之间可能包含重叠产品，规模变化不等同净申购。`},
    {id:'crowding',label:'拥挤观察方向',items:crowdedDirections.map(({id,name,proof})=>({id,name,value:`近12月新发 ${proof.validation.launched12Months||0}只`})),detail:`当前期限 Top 10 中共有 ${crowded} 个拥挤观察方向：${crowdedDirections.map(({name})=>name).join('、')}。判断同时考虑同类产品数量、近12个月新发和当前规模。点击新发数量可查看具体基金。`},
    {id:'turnover',label:'Top 10 本期变化',entered,exited,detail:`与${previousHistory?.date||'上一有效快照'}的综合模型 Top 10 比较：新进入 ${entered.map(({name})=>name).join('、')||'无'}；退出 ${exited.map(({name})=>name).join('、')||'无'}。升降幅与归因可在方向详情的判断与证据链中查看。`},
  ]}
}

function Chevron() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
function RankMove({delta}) {
  const direction=delta>0?'up':delta<0?'down':'flat'
  return <span className={`rank-move rank-move--${direction}`} title={delta?`较上一有效快照综合排名${delta>0?'上升':'下降'}，幅度与归因见方向详情`:'较上一有效快照综合排名持平'} aria-label={delta?`综合排名${delta>0?'上升':'下降'}`:'综合排名持平'}><svg viewBox="0 0 16 16" aria-hidden="true">{direction==='up'?<path d="M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5"/>:direction==='down'?<path d="M8 3v10m0 0 3.5-3.5M8 13 4.5 9.5"/>:<path d="M3 8h10"/>}</svg></span>
}

export function ResearchHorizonBrief({ snapshot,onOpen,onOpenNewFunds,evidenceItems=[],externalItems=[] }) {
  const [horizon,setHorizon]=useState('quarter')
  const [detail,setDetail]=useState('')
  const ranked=useMemo(()=>buildRankedDirections(snapshot,horizon,evidenceItems,externalItems),[snapshot,horizon,evidenceItems,externalItems])
  const directions=ranked.slice(0,10)
  const brief=useMemo(()=>buildPoolBrief(ranked,horizon,snapshot.rankingHistory||[]),[ranked,horizon,snapshot.rankingHistory])
  const selectedMetric=brief.metrics.find((item)=>item.id===detail)

  const exportBrief=()=>{
    const metricLines=brief.metrics.flatMap((item)=>{
      if(item.items?.length)return [`${item.label}：`,...item.items.map((row,index)=>`  ${index+1}. ${row.name}：${row.value}`)]
      return [`${item.label}：新进 ${item.entered.map(({name})=>name).join('、')||'无'}；退出 ${item.exited.map(({name})=>name).join('、')||'无'}`]
    })
    const lines=[`${brief.label} · 产品池整体判断`,`数据截至 ${brief.dataDate}`,`整体策略：${brief.stance}`,brief.conclusion,'',...metricLines,'',`动作建议：${brief.action}`,'注：仅供产品预研，不构成投资建议。']
    const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'})
    const url=URL.createObjectURL(blob),link=document.createElement('a')
    link.href=url;link.download=`AI-Fund-Mate-${brief.label}-产品池简报.txt`;link.click();URL.revokeObjectURL(url)
  }

  return <section className="horizon-brief" aria-label="产品池期限决策简报">
    <header><div><h2>产品经理前瞻简报</h2><p>左侧保留方向排序，右侧给出产品池在不同期限下的整体判断。排序与判断均不构成投资建议。</p></div><nav aria-label="简报时间范围">{Object.entries(HORIZONS).map(([id,item])=><button type="button" className={horizon===id?'active':''} aria-pressed={horizon===id} onClick={()=>{setHorizon(id);setDetail('')}} key={id}>{item.label}</button>)}</nav></header>
    <div className="horizon-body">
      <aside className="horizon-list" aria-label={`${brief.label}方向排序`}>
        <div className="horizon-list__title"><strong>方向排序</strong></div>
        {directions.map((item,index)=><button type="button" className={`horizon-rank-${index+1}`} onClick={()=>onOpen(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><strong>{item.name}</strong></span><b><RankMove delta={item.rankDelta}/></b></button>)}
        <p>点击方向查看该主题的详细判断与证据链。</p>
      </aside>
      <article className="horizon-analysis horizon-memo">
        <div className="horizon-memo__heading"><div><strong>{brief.label} · 产品池整体判断</strong><span>数据截至 {brief.dataDate}</span></div><em>排行历史 {brief.rankingCount} 期</em></div>
        <section className="horizon-memo__stance"><div><small>整体策略</small><strong>{brief.stance}</strong></div><p>{brief.conclusion}</p></section>
        <div className="horizon-memo__change"><small>排行变化</small><strong>较 {brief.previousDate||'上一期'}</strong><span>新进：{brief.entered.map(({name})=>name).join('、')||'无'}；退出：{brief.exited.map(({name})=>name).join('、')||'无'}。升降幅与归因见方向详情证据链。</span></div>
        <div className="horizon-metrics">{brief.metrics.map((item)=><button type="button" className={detail===item.id?'active':''} aria-pressed={detail===item.id} onClick={()=>setDetail(detail===item.id?'':item.id)} key={item.id}><span>{item.label}</span>{item.items?<div className="horizon-metric-list">{item.items.map((row,index)=><small key={row.name}><i>{index+1}</i><b>{row.name}</b><em className={row.id?'is-link':''} role={row.id?'button':undefined} tabIndex={row.id?0:undefined} onClick={row.id?(event)=>{event.stopPropagation();onOpenNewFunds?.(row.id)}:undefined} onKeyDown={row.id?(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onOpenNewFunds?.(row.id)}}:undefined}>{row.value}</em></small>)}</div>:<small>新进：{item.entered.map(({name})=>name).join('、')||'无'}<br/>退出：{item.exited.map(({name})=>name).join('、')||'无'}</small>}<Chevron/></button>)}</div>
        {selectedMetric?<div className="horizon-detail" role="status"><strong>{selectedMetric.label} · 数据说明</strong><p>{selectedMetric.detail}</p><button type="button" onClick={()=>setDetail('')}>收起</button></div>:null}
        {detail==='evidence'?<div className="horizon-detail" role="status"><strong>本期证据链</strong><p>当前结论同时使用公开基金快照、双平台社会注意力、企业公开经营数据与板块资产容量。每项指标均保留来源、日期与计算口径。</p><button type="button" onClick={()=>setDetail('')}>收起</button></div>:null}
        {detail==='history'?<div className="horizon-detail" role="status"><strong>历史对比</strong><p>当前排行使用已保存的每日快照计算新进、退出与升降方向；完整数据库快照仍在持续积累，趋势判断会随有效样本增加而增强。</p><button type="button" onClick={()=>setDetail('')}>收起</button></div>:null}
        {detail==='method'?<div className="horizon-detail" role="status"><strong>数据口径</strong><p>规模净增按同类产品当前规模减去2025年末同口径规模排序；主题之间可能包含重叠产品，规模变化不等同净申购。拥挤观察同时考虑同类供给、新发与存量规模。</p><button type="button" onClick={()=>setDetail('')}>收起</button></div>:null}
        <div className="horizon-briefing-rows">
          <details><summary><b>01</b><strong>本期发生的三项变化</strong><span>展开证据</span></summary><div className="horizon-row-grid"><p><b>规模</b>Top 10 中 {brief.positiveScale} 个方向规模较年末增长，中位增幅 {signedPct(brief.growthMedian)}；增量主要集中于 {brief.scaleLeaderText}。</p><p><b>趋势</b>仅 {brief.attentionReady} 个方向的注意力分达到 50，扩散仍偏集中。</p><p><b>判断</b>{brief.crowded} 个方向进入拥挤观察，新增立项需要更高证据门槛。</p></div></details>
          <details><summary><b>02</b><strong>给产品经理的动作建议</strong><span>展开建议</span></summary><div className="horizon-row-grid"><p><b>维持核心池名单</b>聚焦证据增强方向，持续追踪证据链。</p><p><b>检查同类产品重合度</b>拥挤方向以跟踪观察为主。</p><p><b>设置升级门槛</b>{brief.action}</p></div></details>
        </div>
        <footer><div><button type="button" className="primary" onClick={()=>setDetail(detail==='evidence'?'':'evidence')}>查看证据链</button><button type="button" onClick={()=>setDetail(detail==='history'?'':'history')}>历史对比</button><button type="button" onClick={exportBrief}>导出本期简报</button></div><button type="button" className="method" onClick={()=>setDetail(detail==='method'?'':'method')}>数据口径 <Chevron/></button></footer>
      </article>
    </div>
  </section>
}
