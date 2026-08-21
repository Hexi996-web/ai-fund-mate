import { useEffect, useMemo, useState } from 'react'
import { PRE_RESEARCH_POOL } from '../data/preResearchPool.js'

const yi = (value) => Number.isFinite(value) ? `${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'

function marketMetrics(item, products) {
  const peers = products.filter((product) => item.keywords.some((word) => product.productName?.toLowerCase().includes(word.toLowerCase())))
  const scales = peers.map((p) => Number(p.currentScaleYi)).filter(Number.isFinite).sort((a,b) => b-a)
  const total = scales.reduce((sum,value) => sum+value,0)
  const top = scales[0] ?? 0
  const top3 = scales.slice(0,3).reduce((sum,value) => sum+value,0)
  const recent = peers.filter((p) => String(p.establishedDate || '') >= '2024-01-01').length
  const gapScore = peers.length < 3 ? 40 : Math.max(0, Math.min(100, 92 - peers.length * 1.5 - recent * 1.2 + (total && top3 / total > .65 ? 8 : 0)))
  const state = peers.length < 8 ? '产品缺失' : peers.length > 35 || recent > 12 ? '供给过剩' : '仍有空位'
  return { count:peers.length, recent, total, topShare:total ? top/total*100 : null, top3Share:total ? top3/total*100 : null, gapScore, state }
}

function Metric({ label, value, note }) { return <div className="decision-metric"><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</div> }

export function PreResearchPool() {
  const [payload, setPayload] = useState({ products:[], updateTime:'加载中' })
  const [selected, setSelected] = useState('')
  useEffect(() => { const controller = new AbortController(); fetch('/fund_products.json',{signal:controller.signal,cache:'no-store'}).then(r=>r.json()).then(setPayload).catch(()=>{}); return () => controller.abort() },[])
  const ranked = useMemo(() => PRE_RESEARCH_POOL.map((item) => { const market=marketMetrics(item,payload.products || []); return {...item,market,score:market.gapScore*.35+item.readiness*.65} }).sort((a,b)=>b.score-a.score).slice(0,10),[payload])
  const active = ranked.find((item)=>item.id===selected) || ranked[0]

  return <main className="workspace-main research-pool decision-mode">
    <header className="decision-hero"><div><h1>动态预研 Top 10</h1><p>从候选宇宙中动态选出10个方向。当前排序已接入产品空位；资产与成分重合度数据未接入前，不伪造完整结论。</p></div><div className="decision-date"><small>基金快照</small><strong>{payload.updateTime || '—'}</strong><span>{PRE_RESEARCH_POOL.length} 选 10</span></div></header>
    <section className="decision-layout">
      <div className="decision-ranking"><div className="decision-ranking__head"><span>排名 / 产品方向</span><span>市场状态</span><span>动态分</span></div>{ranked.map((item,index)=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><strong>{item.name}</strong><small>{item.definition}</small></span><b className={`market-${item.market.state}`}>{item.market.state}</b><em>{Math.round(item.score)}</em></button>)}</div>
      {active && <section className="decision-detail"><div className="decision-detail__title"><div><small>当前研究对象</small><h2>{active.name}</h2></div><span>动态第 {ranked.indexOf(active)+1} 位</span></div>
        <h3>产品空位判断</h3><div className="decision-metrics"><Metric label="同类基金" value={`${active.market.count}只`} note={`名称关键词：${active.keywords.join(' / ')}`} /><Metric label="2024年以来新发" value={`${active.market.recent}只`} /><Metric label="同类总规模" value={yi(active.market.total)} /><Metric label="头部产品占比" value={pct(active.market.topShare)} /><Metric label="前三产品占比" value={pct(active.market.top3Share)} /><Metric label="市场结论" value={active.market.state} /></div><p className="metric-note">口径：按全市场基金产品名称关键词匹配、产品份额合并后计算。点击其他方向会立即重算，不把名称匹配等同于最终同类认定。</p>
        <h3>可投资资产检验</h3><div className="data-contract"><div><small>候选股票数</small><strong>待接入</strong></div><div><small>组合日均成交额</small><strong>待接入</strong></div><div><small>第一行业占比</small><strong>待接入</strong></div><div><small>前十大权重</small><strong>待接入</strong></div><div><small>主题收入纯度</small><strong>待接入</strong></div><div><small>概念映射风险</small><strong>不可判定</strong></div></div><p className="blocked-note">需要先选择代表指数或建立候选股票池；没有成分与收入数据时，本模块不会给出“可投”结论。</p>
        <h3>产品差异化检验</h3><div className="difference-empty"><strong>尚不能判断是不是“换名字的旧产品”</strong><p>下一数据接口必须包含：代表指数成分及权重、同类ETF成分及权重、公司内部产品持仓。接入后计算成分重合率、权重重合率与内部产品重合率。</p><div><span>代表指数 ↔ 同类ETF</span><b>待计算</b><span>代表指数 ↔ 公司产品</span><b>待计算</b></div></div>
      </section>}
    </section>
  </main>
}
