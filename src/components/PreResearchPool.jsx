import { useMemo, useState } from 'react'
import { FACT_OVERVIEW, PRE_RESEARCH_AS_OF, PRE_RESEARCH_POOL } from '../data/preResearchPool.js'

const FILTERS = ['全部', '有量化数据', '政策锚点', '待补数据']

function FactIcon({ type }) {
  const paths = { policy: 'M7 3h10v4H7zM5 9h14v12H5zM9 13h6M9 17h4', energy: 'M13 2L5 14h6l-1 8 9-13h-6z', people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 10v-2a7 7 0 0 0-14 0v2M16 4a3 3 0 0 1 0 6M22 21v-2a6 6 0 0 0-4-5.6', data: 'M4 19V9M10 19V5M16 19v-7M22 19H2' }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[type]} /></svg>
}

function MiniBars({ values, labels }) {
  const max = Math.max(...values)
  return <div className="fact-bars" aria-label="历史趋势">{values.map((value, index) => <div key={labels[index]}><i style={{ height: `${Math.max(18, value / max * 100)}%` }} /><span>{labels[index]}</span></div>)}</div>
}

export function PreResearchPool() {
  const [filter, setFilter] = useState('全部')
  const [selectedId, setSelectedId] = useState(PRE_RESEARCH_POOL[0].id)
  const visible = useMemo(() => filter === '全部' ? PRE_RESEARCH_POOL : PRE_RESEARCH_POOL.filter((item) => item.status === filter), [filter])

  return <main className="workspace-main research-pool fact-mode">
    <header className="research-pool__hero"><div><h1>预研产品池</h1><p>只展示可核验的官方事实与数据状态。暂不加入产品经理评分、排序或立项判断。</p></div><div className="research-pool__date"><span>数据观察时点</span><strong>{PRE_RESEARCH_AS_OF}</strong><small>来源与日期随卡片展示</small></div></header>
    <section className="fact-overview" aria-label="核心事实总览">{FACT_OVERVIEW.map((item) => <article key={item.label}><span><FactIcon type={item.icon} /></span><div><small>{item.label}</small><strong>{item.value}</strong><p>{item.note}</p></div></article>)}</section>
    <div className="research-pool__toolbar"><div className="research-pool__filters" aria-label="数据状态筛选">{FILTERS.map((item) => <button key={item} type="button" className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item} {item === '全部' ? PRE_RESEARCH_POOL.length : PRE_RESEARCH_POOL.filter((entry) => entry.status === item).length}</button>)}</div><span>共 {visible.length} 个方向</span></div>
    <section className="research-pool__grid" aria-label="社会认知事实列表">{visible.map((item) => {
      const expanded = selectedId === item.id
      return <article className={`research-card ${expanded ? 'expanded' : ''}`} key={item.id}>
        <button type="button" className="research-card__summary fact-summary" aria-expanded={expanded} onClick={() => setSelectedId(expanded ? '' : item.id)}>
          <span className="research-card__number">{String(PRE_RESEARCH_POOL.indexOf(item) + 1).padStart(2, '0')}</span>
          <span className="research-card__title"><strong>{item.name}</strong><small>{item.narrative}</small></span>
          <span className={`fact-status status-${item.status === '有量化数据' ? 'data' : item.status === '待补数据' ? 'pending' : 'policy'}`}>{item.status}</span>
          <span className="fact-headline"><strong>{item.headline}</strong><small>{item.subline}</small></span>
          {item.delta ? <span className="fact-delta">{item.delta}</span> : <span className="research-card__cue">{expanded ? '收起' : '查看事实'}</span>}
        </button>
        {expanded ? <div className="fact-detail"><div className="fact-list">{item.facts.map(([label, value]) => <div key={`${label}-${value}`}><small>{label}</small><strong>{value}</strong></div>)}</div>{item.chart ? <MiniBars values={item.chart} labels={item.labels} /> : <div className="fact-no-chart"><FactIcon type="data" /><span>统一产业与产品数据待接入</span></div>}<p className="fact-source">来源：{item.source}</p></div> : null}
      </article>
    })}</section>
    <section className="research-pool__gate"><div><span>01</span><strong>可相信</strong><p>事实存在、来源可追溯，产品名称与底层资产一致。</p></div><div><span>02</span><strong>可实现</strong><p>后续接入容量、流动性、指数样本和产品供给数据。</p></div><div><span>03</span><strong>可负责</strong><p>正式立项前再补充客户结果与回撤情景。</p></div></section>
  </main>
}
