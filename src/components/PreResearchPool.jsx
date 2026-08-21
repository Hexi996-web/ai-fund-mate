import { useEffect, useMemo, useState } from 'react'
import { PRE_RESEARCH_POOL } from '../data/preResearchPool.js'

const yi = (value) => Number.isFinite(value) ? `${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'
const signedYi = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}亿元` : '—'
const num = (value) => value == null ? Number.NaN : Number(value)

function marketMetrics(item, products, updateTime) {
  const peers = products.filter((product) => item.keywords.some((word) => product.productName?.toLowerCase().includes(word.toLowerCase())))
  const scales = peers.map((p) => num(p.currentScaleYi)).filter(Number.isFinite).sort((a,b) => b-a)
  const total = scales.reduce((sum,value) => sum+value,0)
  const comparable = peers.filter((p) => Number.isFinite(num(p.baselineScaleYi)) && Number.isFinite(num(p.currentScaleYi)))
  const baselineTotal = comparable.reduce((sum,p) => sum+num(p.baselineScaleYi),0)
  const comparableCurrent = comparable.reduce((sum,p) => sum+num(p.currentScaleYi),0)
  const scaleIncrease = comparable.reduce((sum,p) => sum+(Number.isFinite(num(p.scaleNetIncreaseYi)) ? num(p.scaleNetIncreaseYi) : num(p.currentScaleYi)-num(p.baselineScaleYi)),0)
  const scaleGrowth = baselineTotal ? scaleIncrease/baselineTotal*100 : null
  const top = scales[0] ?? 0
  const top3 = scales.slice(0,3).reduce((sum,value) => sum+value,0)
  const asOf = new Date(String(updateTime || '').replace(' ','T'))
  const cutoff12 = new Date(asOf); cutoff12.setFullYear(cutoff12.getFullYear()-1)
  const cutoff90 = new Date(asOf); cutoff90.setDate(cutoff90.getDate()-90)
  const launched12 = peers.filter((p) => new Date(p.establishedDate) >= cutoff12)
  const launched90 = peers.filter((p) => new Date(p.establishedDate) >= cutoff90)
  const gapScore = peers.length < 3 ? 40 : Math.max(0, Math.min(100, 92 - peers.length*1.5 - launched12.length*2 + (total && top3/total>.65 ? 8 : 0)))
  const supplyState = launched12.length > 10 || launched90.length > 4 ? '新增拥挤' : launched12.length < 3 ? '新增稀少' : '新增适中'
  const scaleState = scaleGrowth > 10 ? '规模扩张' : scaleGrowth < -10 ? '规模收缩' : '规模平稳'
  const state = peers.length < 8 ? '产品缺失' : peers.length > 35 && supplyState === '新增拥挤' ? '供给过剩' : supplyState === '新增稀少' && scaleState === '规模扩张' ? '存在空位' : '继续观察'
  return { count:peers.length, launched12, launched90, total, baselineTotal, comparableCurrent, comparableCount:comparable.length, scaleIncrease, scaleGrowth, supplyState, scaleState, topShare:total ? top/total*100 : null, top3Share:total ? top3/total*100 : null, gapScore, state, peers:peers.sort((a,b)=>(b.currentScaleYi||0)-(a.currentScaleYi||0)) }
}

function MetricButton({ label, value, onClick }) { return <button type="button" className="decision-metric decision-metric--link" onClick={onClick}><small>{label}</small><strong>{value}</strong><span>查看依据 →</span></button> }

function ChangeBar({ value }) {
  const width = Math.min(100, Math.abs(value || 0))
  return <span className="change-visual"><i className={value >= 0 ? 'up' : 'down'} style={{width:`${width}%`}} /><b>{pct(value)}</b></span>
}

export function PreResearchPool() {
  const [payload, setPayload] = useState({ products:[], updateTime:'加载中' })
  const [selected, setSelected] = useState('')
  const [drawer, setDrawer] = useState('')
  useEffect(() => { const controller = new AbortController(); fetch('/fund_products.json',{signal:controller.signal,cache:'no-store'}).then(r=>r.json()).then(setPayload).catch(()=>{}); return () => controller.abort() },[])
  const ranked = useMemo(() => {
    const priority = { '产品缺失':4, '存在空位':3, '继续观察':2, '供给过剩':1 }
    return PRE_RESEARCH_POOL.map((item) => ({...item,market:marketMetrics(item,payload.products || [],payload.updateTime)})).sort((a,b) => priority[b.market.state]-priority[a.market.state] || (b.market.scaleGrowth||-999)-(a.market.scaleGrowth||-999) || a.market.launched12.length-b.market.launched12.length).slice(0,10)
  },[payload])
  const active = ranked.find((item)=>item.id===selected) || ranked[0]

  return <main className="workspace-main research-pool decision-mode">
    <header className="decision-hero"><div><h1>季度预研产品池</h1><p>面向产品经理的前瞻观察池。数据持续更新，名单原则上按季度调整；重大政策、技术突破或企业证伪时触发临时复核。</p></div><div className="decision-date"><small>基金快照</small><strong>{payload.updateTime || '—'}</strong><span>{PRE_RESEARCH_POOL.length} 选 10</span></div></header>
    <section className="decision-layout">
      <div className="decision-ranking"><div className="decision-ranking__head"><span>季度序位 / 产品方向</span><span>近12月新发</span><span>规模变化</span><span>结论</span></div>{ranked.map((item,index)=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><strong>{item.name}</strong><small>{item.definition}</small></span><em>{item.market.launched12.length}只</em><ChangeBar value={item.market.scaleGrowth} /><b className={`market-${item.market.state}`}>{item.market.state}</b></button>)}</div>
      {active && <section className="decision-detail"><div className="decision-detail__title"><div><small>当前研究对象</small><h2>{active.name}</h2></div><span>季度序位 {ranked.indexOf(active)+1}</span></div>
        <h3>产品空位判断</h3><div className="decision-metrics"><MetricButton label="同类基金" value={`${active.market.count}只`} onClick={()=>setDrawer('all')} /><MetricButton label="近12个月新发" value={`${active.market.launched12.length}只 · ${active.market.supplyState}`} onClick={()=>setDrawer('12m')} /><MetricButton label="近90天新发" value={`${active.market.launched90.length}只`} onClick={()=>setDrawer('90d')} /><MetricButton label="基准规模（2025年末披露规模）" value={yi(active.market.baselineTotal)} onClick={()=>setDrawer('scale')} /><MetricButton label="当前规模" value={yi(active.market.total)} onClick={()=>setDrawer('scale')} /><MetricButton label="规模增加额" value={`${signedYi(active.market.scaleIncrease)} · ${active.market.scaleState}`} onClick={()=>setDrawer('scale')} /><MetricButton label="头部产品占比" value={pct(active.market.topShare)} onClick={()=>setDrawer('top1')} /><MetricButton label="前三产品占比" value={pct(active.market.top3Share)} onClick={()=>setDrawer('top3')} /><MetricButton label="市场结论" value={active.market.state} onClick={()=>setDrawer('state')} /></div><div className="scale-definitions"><p><strong>基准规模</strong>可比产品在基准日（通常为2025年末）的规模合计；缺少基准数据的产品不计入。</p><p><strong>当前规模</strong>同类产品最近一期披露规模的合计，包含基准日后新成立的产品。</p><p><strong>规模增加额</strong>仅对同时拥有基准与当前规模的产品计算“当前－基准”并汇总；当前可比样本 {active.market.comparableCount}/{active.market.count}只，避免把新基金全部规模误算成增长。</p></div><p className="metric-note">滚动新发以快照日为基准。名称关键词：{active.keywords.join(' / ')}。</p>
      </section>}
    </section>
    {drawer && active && <><button className="peer-backdrop" aria-label="关闭指标依据" onClick={()=>setDrawer('')} /><aside className="peer-drawer" aria-label="产品空位指标依据"><header><div><small>{active.name}</small><h2>{{all:'全部同类基金', '12m':'近12个月新发', '90d':'近90天新发', scale:'规模变化明细', top1:'头部产品占比', top3:'前三产品占比', state:'市场结论依据'}[drawer]}</h2><p>数据快照 {payload.updateTime}</p></div><button type="button" onClick={()=>setDrawer('')}>关闭</button></header>{drawer==='state'?<div className="state-explain"><strong>{active.market.state}</strong><div className="conclusion-axis"><div><small>新增供给</small><b>{active.market.supplyState}</b><p>近12个月 {active.market.launched12.length}只，近90天 {active.market.launched90.length}只。</p></div><div><small>规模变化</small><b>{active.market.scaleState}</b><p>可比规模 {signedYi(active.market.scaleIncrease)}，变化率 {pct(active.market.scaleGrowth)}。</p></div></div><ul><li>产品少于8只，判断为“产品缺失”。</li><li>产品超过35只且新增拥挤，判断为“供给过剩”。</li><li>新增稀少但可比规模扩张，判断为“存在空位”。</li><li>其余情况为“继续观察”。</li></ul></div>:<div className="peer-table peer-table--scale"><div><span>基金产品</span><span>代码</span><span>基准规模</span><span>当前规模</span><span>增加额</span></div>{(drawer==='12m'?active.market.launched12:drawer==='90d'?active.market.launched90:drawer==='top1'?active.market.peers.slice(0,1):drawer==='top3'?active.market.peers.slice(0,3):active.market.peers).map((fund)=><div key={fund.productId}><strong>{fund.productName}</strong><span>{fund.representativeCode}</span><span>{yi(num(fund.baselineScaleYi))}</span><span>{yi(num(fund.currentScaleYi))}</span><span className={(num(fund.scaleNetIncreaseYi)||0)>=0?'positive':'negative'}>{signedYi(num(fund.scaleNetIncreaseYi))}</span></div>)}</div>}</aside></>}
  </main>
}
