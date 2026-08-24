import { useEffect, useMemo, useState } from 'react'
import { PRE_RESEARCH_POOL } from '../data/preResearchPool.js'
import { CORE_ATTENTION_IDS } from '../data/attentionPool.js'
import { AttentionHeatmap } from './AttentionHeatmap.jsx'

const yi = (value) => Number.isFinite(value) ? `${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'
const signedYi = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}亿元` : '—'
const num = (value) => value == null ? Number.NaN : Number(value)
const fundGrowth = (fund) => Number.isFinite(num(fund.scaleGrowthPercent)) ? num(fund.scaleGrowthPercent) : Number.isFinite(num(fund.baselineScaleYi)) && num(fund.baselineScaleYi) ? (num(fund.currentScaleYi)-num(fund.baselineScaleYi))/num(fund.baselineScaleYi)*100 : Number.NaN
const sortable = (value) => Number.isFinite(value) ? value : -Infinity
const latestDate = (values) => values.filter(Boolean).sort().at(-1) || '—'

function marketMetrics(item, products, updateTime) {
  const peers = products.filter((product) => item.keywords.some((word) => product.productName?.toLowerCase().includes(word.toLowerCase())))
  const scales = peers.map((p) => num(p.currentScaleYi)).filter(Number.isFinite).sort((a,b) => b-a)
  const total = scales.reduce((sum,value) => sum+value,0)
  const comparable = peers.filter((p) => p.baselineScaleType === '2025年末披露规模' && Number.isFinite(num(p.baselineScaleYi)) && Number.isFinite(num(p.currentScaleYi)))
  const baselineScaleDate = comparable.length ? '2025-12-31' : '—'
  const currentScaleDate = latestDate(peers.flatMap((p) => (p.shares || []).map((share) => share.scaleDate)))
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
  return { count:peers.length, launched12, launched90, total, baselineTotal, baselineScaleDate, currentScaleDate, comparableCurrent, comparableCount:comparable.length, scaleIncrease, scaleGrowth, supplyState, scaleState, topShare:total ? top/total*100 : null, top3Share:total ? top3/total*100 : null, gapScore, state, peers:peers.sort((a,b)=>(b.currentScaleYi||0)-(a.currentScaleYi||0)) }
}

function MetricButton({ label, value, onClick }) { return <button type="button" className="decision-metric decision-metric--link" onClick={onClick}><small>{label}</small><strong>{value}</strong><span>查看依据 →</span></button> }

function ChangeBar({ value }) {
  const width = Math.min(100, Math.max(6, Math.log10(Math.abs(value || 0) + 1) * 32))
  return <span className="change-visual" title="同口径可比基金当前规模减去2025年末披露规模"><i className={value >= 0 ? 'up' : 'down'} style={{width:`${width}%`}} /><b>{signedYi(value)}</b></span>
}

const evidenceMeta = {
  structure:{title:'结构驱动', self:'核心产业指标的3年趋势', peer:'所属产业基准', metrics:['需求量/渗透率','产能或基础设施','政策目标完成度']},
  enterprise:{title:'企业兑现', self:'板块收入与利润连续性', peer:'同产业企业中位数', metrics:['收入增速','利润增速','订单或合同负债']},
  assets:{title:'资产承载', self:'可投资资产池自身变化', peer:'相近可投资资产池', metrics:['流通市值','成交额与流动性','成分数量与集中度']}
}

function EvidenceDrawer({ layer, item, updateTime, onClose }) {
  const meta = evidenceMeta[layer]
  const asset = item.assets
  const hasTrend = Array.isArray(item[layer]?.history) && item[layer].history.length > 1
  return <><button className="peer-backdrop" aria-label="关闭证据趋势" onClick={onClose}/><aside className="peer-drawer evidence-drawer" aria-label={`${meta.title}趋势`}><header><div><small>{meta.title}</small><h2>自身趋势 × 同行业比较</h2><p>数据快照 {updateTime}</p></div><button type="button" onClick={onClose}>关闭</button></header><div className="evidence-compare-axis"><div><small>纵向</small><strong>{meta.self}</strong></div><div><small>横向</small><strong>{meta.peer}</strong></div></div>{layer==='assets'?<div className="evidence-current"><h3>当前资产承载</h3><div><span><small>代表板块</small><strong>{asset.boardName || '—'}</strong></span><span><small>总市值</small><strong>{yi(asset.totalMarketCapYi)}</strong></span><span><small>流通市值</small><strong>{yi(asset.floatMarketCapYi)}</strong></span><span><small>流通比</small><strong>{pct(asset.floatRatio)}</strong></span></div></div>:<div className="evidence-unavailable"><strong>尚无可验证的连续数据，暂不形成结论</strong><p>{layer==='enterprise'?'PE属于估值，不代表收入、利润或订单兑现，已从本层移除。':'当前只有结构叙事，没有对应产业指标时间序列。'}</p></div>}<div className="trend-contract"><div><small>趋势状态</small><strong>{hasTrend?'可查看':'序列建设中（当前1期或未接入）'}</strong></div>{meta.metrics.map(metric=><div key={metric}><small>必须接入</small><strong>{metric}</strong></div>)}</div><p className="evidence-principle">同口径历史点达到4期且具备同行业基准后，才显示趋势判断；不使用候选池内部排名替代。</p></aside></>
}

export function PreResearchPool() {
  const [payload, setPayload] = useState({ products:[], updateTime:'加载中' })
  const [evidence, setEvidence] = useState({ items:[], updateTime:'加载中' })
  const [selected, setSelected] = useState('')
  const [drawer, setDrawer] = useState('')
  const [evidenceLayer, setEvidenceLayer] = useState('')
  const [peerSort, setPeerSort] = useState('current')
  useEffect(() => { const controller = new AbortController(); Promise.all([fetch('/fund_products.json',{signal:controller.signal,cache:'no-store'}).then(r=>r.json()),fetch('/pre_research_evidence.json',{signal:controller.signal,cache:'no-store'}).then(r=>r.json())]).then(([funds,proof])=>{setPayload(funds);setEvidence(proof)}).catch(()=>{}); return () => controller.abort() },[])
  const evidenceById = useMemo(() => new Map((evidence.items || []).map((item)=>[item.id,item])),[evidence.items])
  const ranked = useMemo(() => {
    const priority = { '产品缺失':4, '存在空位':3, '继续观察':2, '供给过剩':1 }
    const coreOrder = new Map(CORE_ATTENTION_IDS.map((id,index)=>[id,index]))
    return PRE_RESEARCH_POOL.map((item) => ({...item,market:marketMetrics(item,payload.products || [],payload.updateTime)})).filter((item)=>coreOrder.has(item.id)).sort((a,b) => coreOrder.get(a.id)-coreOrder.get(b.id) || priority[b.market.state]-priority[a.market.state]).slice(0,10)
  },[payload])
  const active = ranked.find((item)=>item.id===selected) || ranked[0]
  const activeEvidence = active ? evidenceById.get(active.id) : null
  const drawerFunds = useMemo(() => {
    if (!active) return []
    const base = drawer==='12m'?active.market.launched12:drawer==='90d'?active.market.launched90:drawer==='top1'?active.market.peers.slice(0,1):drawer==='top3'?active.market.peers.slice(0,3):active.market.peers
    return [...base].sort((a,b) => peerSort==='growth' ? sortable(fundGrowth(b))-sortable(fundGrowth(a)) : sortable(num(b.currentScaleYi))-sortable(num(a.currentScaleYi)))
  },[active,drawer,peerSort])

  return <main className="workspace-main research-pool decision-mode">
    <header className="decision-hero"><div><h1>季度预研产品池</h1><p>面向产品经理的前瞻观察池。候选方向可动态进出，原则上按季度依据最新证据重排；重大政策、技术突破或企业证伪时触发临时复核，不按日追逐市场热点。</p></div><div className="decision-date"><small>基金快照</small><strong>{payload.updateTime || '—'}</strong><span>{PRE_RESEARCH_POOL.length} 选 10 · 季度重排</span></div></header>
    <AttentionHeatmap onSelectCore={(id)=>{setSelected(id); document.querySelector('.decision-layout')?.scrollIntoView({behavior:'smooth',block:'start'})}} />
    <section className="decision-layout">
      <div className="decision-ranking"><div className="decision-ranking__head"><span>季度序位 / 产品方向</span><span>近12月新发</span><span>规模净增加额</span><span>产品结论</span></div>{ranked.map((item,index)=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><strong>{item.name}</strong><small>{item.definition}</small></span><em>{item.market.launched12.length}只</em><ChangeBar value={item.market.scaleIncrease} /><b className={`market-${item.market.state}`}>{item.market.state}</b></button>)}</div>
      {active && <section className="decision-detail"><div className="decision-detail__title"><div><small>当前研究对象</small><h2>{active.name}</h2></div><span>季度序位 {ranked.indexOf(active)+1}</span></div>
        {activeEvidence ? <><h3>三层验证证据</h3><div className="evidence-four evidence-three"><button type="button" onClick={()=>setEvidenceLayer('structure')}><small>结构驱动</small><strong>{activeEvidence.structure.signal}</strong><span>自身趋势 × 所属产业基准</span><em>查看趋势与数据要求 →</em></button><button type="button" onClick={()=>setEvidenceLayer('enterprise')}><small>企业兑现</small><strong>收入 / 利润 / 订单</strong><span>不再用PE代替企业兑现</span><em>查看趋势与数据要求 →</em></button><button type="button" onClick={()=>setEvidenceLayer('assets')}><small>资产承载</small><strong>{activeEvidence.assets.boardName} · {yi(activeEvidence.assets.floatMarketCapYi)}</strong><span>自身变化 × 相近资产池</span><em>查看趋势与数据要求 →</em><i style={{width:`${activeEvidence.assets.floatRatio || 0}%`}} /></button></div><p className="evidence-source">公开数据快照 {evidence.updateTime} · 不使用候选池内部横向排名</p></> : null}
        <h3>产品空位判断</h3><div className="decision-metrics"><MetricButton label="同类基金" value={`${active.market.count}只`} onClick={()=>setDrawer('all')} /><MetricButton label="近12个月新发" value={`${active.market.launched12.length}只 · ${active.market.supplyState}`} onClick={()=>setDrawer('12m')} /><MetricButton label="近90天新发" value={`${active.market.launched90.length}只`} onClick={()=>setDrawer('90d')} /><MetricButton label={`基准规模（${active.market.baselineScaleDate}）`} value={yi(active.market.baselineTotal)} onClick={()=>setDrawer('scale')} /><MetricButton label={`最新可得规模（截至${active.market.currentScaleDate}）`} value={yi(active.market.total)} onClick={()=>setDrawer('scale')} /><MetricButton label="规模增加额" value={`${signedYi(active.market.scaleIncrease)} · ${active.market.scaleState}`} onClick={()=>setDrawer('scale')} /><MetricButton label="头部产品占比" value={pct(active.market.topShare)} onClick={()=>setDrawer('top1')} /><MetricButton label="前三产品占比" value={pct(active.market.top3Share)} onClick={()=>setDrawer('top3')} /><MetricButton label="市场结论" value={active.market.state} onClick={()=>setDrawer('state')} /></div><div className="scale-definitions"><p><strong>基准规模 · {active.market.baselineScaleDate}</strong>可比产品在基准日的披露规模合计；缺少基准数据的产品不计入。</p><p><strong>最新可得规模 · 截至{active.market.currentScaleDate}</strong>同类产品各自最近有效规模的合计，包含基准日后新成立的产品；ETF可按交易数据估算，非ETF以最新公开披露为准，因此不等同盘中实时规模。</p><p><strong>规模增加额</strong>仅对同时拥有基准与当前规模的产品计算“当前－基准”并汇总；当前可比样本 {active.market.comparableCount}/{active.market.count}只，避免把新基金全部规模误算成增长。</p></div><p className="metric-note">滚动新发以快照日为基准。名称关键词：{active.keywords.join(' / ')}。</p>
      </section>}
    </section>
    {drawer && active && <><button className="peer-backdrop" aria-label="关闭指标依据" onClick={()=>setDrawer('')} /><aside className="peer-drawer" aria-label="产品空位指标依据"><header><div><small>{active.name}</small><h2>{{all:'全部同类基金', '12m':'近12个月新发', '90d':'近90天新发', scale:'规模变化明细', top1:'头部产品占比', top3:'前三产品占比', state:'市场结论依据'}[drawer]}</h2><p>数据快照 {payload.updateTime}</p></div><div className="peer-head-actions">{drawer!=='state'?<select aria-label="同类基金排序" value={peerSort} onChange={(event)=>setPeerSort(event.target.value)}><option value="current">当前规模 ↓</option><option value="growth">规模增幅 ↓</option></select>:null}<button type="button" onClick={()=>setDrawer('')}>关闭</button></div></header>{drawer==='state'?<div className="state-explain"><strong>{active.market.state}</strong><div className="conclusion-axis"><div><small>新增供给</small><b>{active.market.supplyState}</b><p>近12个月 {active.market.launched12.length}只，近90天 {active.market.launched90.length}只。</p></div><div><small>规模变化</small><b>{active.market.scaleState}</b><p>可比规模 {signedYi(active.market.scaleIncrease)}，变化率 {pct(active.market.scaleGrowth)}。</p></div></div><ul><li>产品少于8只，判断为“产品缺失”。</li><li>产品超过35只且新增拥挤，判断为“供给过剩”。</li><li>新增稀少但可比规模扩张，判断为“存在空位”。</li><li>其余情况为“继续观察”。</li></ul></div>:<div className="peer-table peer-table--scale"><div><span>基金产品</span><span>代码</span><span>基准规模</span><span>当前规模</span><span>增加额</span><span>规模增幅</span></div>{drawerFunds.map((fund)=><div key={fund.productId}><strong>{fund.productName}</strong><span>{fund.representativeCode}</span><span>{yi(num(fund.baselineScaleYi))}</span><span>{yi(num(fund.currentScaleYi))}</span><span className={(num(fund.scaleNetIncreaseYi)||0)>=0?'positive':'negative'}>{signedYi(num(fund.scaleNetIncreaseYi))}</span><span className={(fundGrowth(fund)||0)>=0?'positive':'negative'}>{Number.isFinite(fundGrowth(fund))?`${fundGrowth(fund)>=0?'+':''}${fundGrowth(fund).toFixed(1)}%`:'—'}</span></div>)}</div>}</aside></>}
    {evidenceLayer && activeEvidence ? <EvidenceDrawer layer={evidenceLayer} item={activeEvidence} updateTime={evidence.updateTime} onClose={()=>setEvidenceLayer('')} /> : null}
  </main>
}
