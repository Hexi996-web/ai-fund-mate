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
  return { count:peers.length, recent, total, topShare:total ? top/total*100 : null, top3Share:total ? top3/total*100 : null, gapScore, state, peers:peers.sort((a,b)=>(b.currentScaleYi||0)-(a.currentScaleYi||0)) }
}

function Metric({ label, value, note }) { return <div className="decision-metric"><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</div> }

export function PreResearchPool() {
  const [payload, setPayload] = useState({ products:[], updateTime:'加载中' })
  const [selected, setSelected] = useState('')
  const [peerOpen, setPeerOpen] = useState(false)
  useEffect(() => { const controller = new AbortController(); fetch('/fund_products.json',{signal:controller.signal,cache:'no-store'}).then(r=>r.json()).then(setPayload).catch(()=>{}); return () => controller.abort() },[])
  const ranked = useMemo(() => PRE_RESEARCH_POOL.map((item) => { const market=marketMetrics(item,payload.products || []); return {...item,market,score:market.gapScore*.35+item.readiness*.65} }).sort((a,b)=>b.score-a.score).slice(0,10),[payload])
  const active = ranked.find((item)=>item.id===selected) || ranked[0]

  return <main className="workspace-main research-pool decision-mode">
    <header className="decision-hero"><div><h1>动态预研 Top 10</h1><p>从候选宇宙中动态选出10个方向。当前排序已接入产品空位；资产与成分重合度数据未接入前，不伪造完整结论。</p></div><div className="decision-date"><small>基金快照</small><strong>{payload.updateTime || '—'}</strong><span>{PRE_RESEARCH_POOL.length} 选 10</span></div></header>
    <section className="decision-layout">
      <div className="decision-ranking"><div className="decision-ranking__head"><span>排名 / 产品方向</span><span>市场状态</span><span>动态分</span></div>{ranked.map((item,index)=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><strong>{item.name}</strong><small>{item.definition}</small></span><b className={`market-${item.market.state}`}>{item.market.state}</b><em>{Math.round(item.score)}</em></button>)}</div>
      {active && <section className="decision-detail"><div className="decision-detail__title"><div><small>当前研究对象</small><h2>{active.name}</h2></div><span>动态第 {ranked.indexOf(active)+1} 位</span></div>
        <h3>产品空位判断</h3><div className="decision-metrics"><button type="button" className="decision-metric decision-metric--link" onClick={()=>setPeerOpen(true)}><small>同类基金</small><strong>{active.market.count}只</strong><span>查看完整清单 →</span></button><Metric label="2024年以来新发" value={`${active.market.recent}只`} /><Metric label="同类总规模" value={yi(active.market.total)} /><Metric label="头部产品占比" value={pct(active.market.topShare)} /><Metric label="前三产品占比" value={pct(active.market.top3Share)} /><Metric label="市场结论" value={active.market.state} /></div><p className="metric-note">口径：按全市场基金产品名称关键词匹配、产品份额合并后计算。关键词：{active.keywords.join(' / ')}。清单允许逐只核查误匹配。</p>
        <h3>可投资资产检验</h3><div className="data-contract"><div><small>候选股票数</small><strong>待接入</strong></div><div><small>组合日均成交额</small><strong>待接入</strong></div><div><small>第一行业占比</small><strong>待接入</strong></div><div><small>前十大权重</small><strong>待接入</strong></div><div><small>主题收入纯度</small><strong>待接入</strong></div><div><small>概念映射风险</small><strong>不可判定</strong></div></div><p className="blocked-note">可接入公开数据库：AKShare公开行情用于股票、成交额和行业；中证/国证公开资料用于指数成分与权重。需先为每个方向确定代表指数或候选股票池规则。</p>
        <h3>产品差异化检验</h3><div className="difference-empty"><strong>尚不能判断是不是“换名字的旧产品”</strong><p>不依赖公司内部数据：使用公开指数成分、ETF跟踪标的与定期报告，对候选方案和全市场同类产品计算重合度。</p><div><span>候选股票池 ↔ 同类指数</span><b>待计算</b><span>候选指数 ↔ 同类ETF</span><b>待计算</b></div></div>
      </section>}
    </section>
    {peerOpen && active && <><button className="peer-backdrop" aria-label="关闭同类基金清单" onClick={()=>setPeerOpen(false)} /><aside className="peer-drawer" aria-label="同类基金清单"><header><div><small>{active.name}</small><h2>同类基金 {active.market.count}只</h2><p>逐只核查名称匹配结果；规模合计 {yi(active.market.total)}</p></div><button type="button" onClick={()=>setPeerOpen(false)}>关闭</button></header><div className="peer-table"><div><span>基金产品</span><span>代码</span><span>规模</span><span>成立日</span></div>{active.market.peers.map((fund)=><div key={fund.productId}><strong>{fund.productName}</strong><span>{fund.representativeCode}</span><span>{yi(Number(fund.currentScaleYi))}</span><span>{fund.establishedDate || '—'}</span></div>)}</div></aside></>}
  </main>
}
