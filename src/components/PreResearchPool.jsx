import { useEffect, useMemo, useState } from 'react'
import { PRE_RESEARCH_POOL } from '../data/preResearchPool.js'

const yi = (value) => Number.isFinite(value) ? `${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'

function marketMetrics(item, products, updateTime) {
  const peers = products.filter((product) => item.keywords.some((word) => product.productName?.toLowerCase().includes(word.toLowerCase())))
  const scales = peers.map((p) => Number(p.currentScaleYi)).filter(Number.isFinite).sort((a,b) => b-a)
  const total = scales.reduce((sum,value) => sum+value,0)
  const top = scales[0] ?? 0
  const top3 = scales.slice(0,3).reduce((sum,value) => sum+value,0)
  const asOf = new Date(String(updateTime || '').replace(' ','T'))
  const cutoff12 = new Date(asOf); cutoff12.setFullYear(cutoff12.getFullYear()-1)
  const cutoff90 = new Date(asOf); cutoff90.setDate(cutoff90.getDate()-90)
  const launched12 = peers.filter((p) => new Date(p.establishedDate) >= cutoff12)
  const launched90 = peers.filter((p) => new Date(p.establishedDate) >= cutoff90)
  const gapScore = peers.length < 3 ? 40 : Math.max(0, Math.min(100, 92 - peers.length*1.5 - launched12.length*2 + (total && top3/total>.65 ? 8 : 0)))
  const state = peers.length < 8 ? '产品缺失' : peers.length > 35 || launched12.length > 10 ? '供给过剩' : '仍有空位'
  return { count:peers.length, launched12, launched90, total, topShare:total ? top/total*100 : null, top3Share:total ? top3/total*100 : null, gapScore, state, peers:peers.sort((a,b)=>(b.currentScaleYi||0)-(a.currentScaleYi||0)) }
}

function MetricButton({ label, value, onClick }) { return <button type="button" className="decision-metric decision-metric--link" onClick={onClick}><small>{label}</small><strong>{value}</strong><span>查看依据 →</span></button> }

export function PreResearchPool() {
  const [payload, setPayload] = useState({ products:[], updateTime:'加载中' })
  const [selected, setSelected] = useState('')
  const [drawer, setDrawer] = useState('')
  useEffect(() => { const controller = new AbortController(); fetch('/fund_products.json',{signal:controller.signal,cache:'no-store'}).then(r=>r.json()).then(setPayload).catch(()=>{}); return () => controller.abort() },[])
  const ranked = useMemo(() => PRE_RESEARCH_POOL.map((item) => { const market=marketMetrics(item,payload.products || [],payload.updateTime); return {...item,market,score:market.gapScore*.35+item.readiness*.65} }).sort((a,b)=>b.score-a.score).slice(0,10),[payload])
  const active = ranked.find((item)=>item.id===selected) || ranked[0]

  return <main className="workspace-main research-pool decision-mode">
    <header className="decision-hero"><div><h1>动态预研 Top 10</h1><p>从候选宇宙中动态选出10个方向。当前只依据可核验的市场产品供给判断空位，全部指标均可下钻核查。</p></div><div className="decision-date"><small>基金快照</small><strong>{payload.updateTime || '—'}</strong><span>{PRE_RESEARCH_POOL.length} 选 10</span></div></header>
    <section className="decision-layout">
      <div className="decision-ranking"><div className="decision-ranking__head"><span>排名 / 产品方向</span><span>市场状态</span><span>动态分</span></div>{ranked.map((item,index)=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><strong>{item.name}</strong><small>{item.definition}</small></span><b className={`market-${item.market.state}`}>{item.market.state}</b><em>{Math.round(item.score)}</em></button>)}</div>
      {active && <section className="decision-detail"><div className="decision-detail__title"><div><small>当前研究对象</small><h2>{active.name}</h2></div><span>动态第 {ranked.indexOf(active)+1} 位</span></div>
        <h3>产品空位判断</h3><div className="decision-metrics"><MetricButton label="同类基金" value={`${active.market.count}只`} onClick={()=>setDrawer('all')} /><MetricButton label="近12个月新发" value={`${active.market.launched12.length}只`} onClick={()=>setDrawer('12m')} /><MetricButton label="近90天新发" value={`${active.market.launched90.length}只`} onClick={()=>setDrawer('90d')} /><MetricButton label="同类总规模" value={yi(active.market.total)} onClick={()=>setDrawer('scale')} /><MetricButton label="头部产品占比" value={pct(active.market.topShare)} onClick={()=>setDrawer('top1')} /><MetricButton label="前三产品占比" value={pct(active.market.top3Share)} onClick={()=>setDrawer('top3')} /><MetricButton label="市场结论" value={active.market.state} onClick={()=>setDrawer('state')} /></div><p className="metric-note">滚动口径以快照日为基准，更接近当前申报与供给压力。名称关键词：{active.keywords.join(' / ')}。</p>
      </section>}
    </section>
    {drawer && active && <><button className="peer-backdrop" aria-label="关闭指标依据" onClick={()=>setDrawer('')} /><aside className="peer-drawer" aria-label="产品空位指标依据"><header><div><small>{active.name}</small><h2>{{all:'全部同类基金', '12m':'近12个月新发', '90d':'近90天新发', scale:'规模构成', top1:'头部产品占比', top3:'前三产品占比', state:'市场结论依据'}[drawer]}</h2><p>数据快照 {payload.updateTime}</p></div><button type="button" onClick={()=>setDrawer('')}>关闭</button></header>{drawer==='state'?<div className="state-explain"><strong>{active.market.state}</strong><p>同类产品 {active.market.count}只；近12个月新发 {active.market.launched12.length}只；头部占比 {pct(active.market.topShare)}。</p><ul><li>少于8只：产品缺失</li><li>超过35只，或近12个月新发超过10只：供给过剩</li><li>其余：仍有空位，但需继续检查集中度</li></ul></div>:<div className="peer-table"><div><span>基金产品</span><span>代码</span><span>规模</span><span>成立日</span></div>{(drawer==='12m'?active.market.launched12:drawer==='90d'?active.market.launched90:drawer==='top1'?active.market.peers.slice(0,1):drawer==='top3'?active.market.peers.slice(0,3):active.market.peers).map((fund)=><div key={fund.productId}><strong>{fund.productName}</strong><span>{fund.representativeCode}</span><span>{yi(Number(fund.currentScaleYi))}</span><span>{fund.establishedDate || '—'}</span></div>)}</div>}</aside></>}
  </main>
}
