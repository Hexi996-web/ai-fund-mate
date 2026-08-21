import { useMemo, useState } from 'react'
import { PRE_RESEARCH_AS_OF, PRE_RESEARCH_POOL, PRIORITY_META } from '../data/preResearchPool.js'

const FILTERS = ['全部', 'A', 'B', 'C']

export function PreResearchPool() {
  const [filter, setFilter] = useState('全部')
  const [selectedId, setSelectedId] = useState(PRE_RESEARCH_POOL[0].id)
  const visible = useMemo(() => filter === '全部' ? PRE_RESEARCH_POOL : PRE_RESEARCH_POOL.filter((item) => item.priority === filter), [filter])

  return <main className="workspace-main research-pool">
    <header className="research-pool__hero">
      <div><span>12—36个月产品储备</span><h1>预研产品池</h1><p>先识别正在成形的社会认知，再决定是否需要一只基金。产品池不是发行清单，也不是收益预测。</p></div>
      <div className="research-pool__date"><span>观察时点</span><strong>{PRE_RESEARCH_AS_OF}</strong><small>季度闸门 · 半年度清理</small></div>
    </header>
    <section className="research-pool__principle" aria-label="预研原则"><strong>入池逻辑</strong><span>社会认知 × 产品化准备度 × 客户结果 × 渠道与容量</span><em>任一方向均须通过“可相信、可实现、可负责”三道门。</em></section>
    <div className="research-pool__toolbar"><div className="research-pool__filters" aria-label="优先级筛选">{FILTERS.map((item) => <button key={item} type="button" className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === '全部' ? '全部 10' : `${item}级 ${PRE_RESEARCH_POOL.filter((entry) => entry.priority === item).length}`}</button>)}</div><span>共 {visible.length} 个方向</span></div>
    <section className="research-pool__grid" aria-label="高潜社会认知列表">
      {visible.map((item) => {
        const expanded = selectedId === item.id
        const meta = PRIORITY_META[item.priority]
        return <article className={`research-card priority-${item.priority.toLowerCase()} ${expanded ? 'expanded' : ''}`} key={item.id}>
          <button type="button" className="research-card__summary" aria-expanded={expanded} onClick={() => setSelectedId(expanded ? '' : item.id)}>
            <span className="research-card__number">{String(PRE_RESEARCH_POOL.indexOf(item) + 1).padStart(2, '0')}</span>
            <span className="research-card__title"><strong>{item.name}</strong><small>{item.narrative}</small></span>
            <span className="research-card__priority"><b>{item.priority}</b><small>{meta.label}</small></span>
            <span className="research-card__stage"><small>认知阶段</small><b>{item.stage}</b></span>
            <span className="research-card__cue">{expanded ? '收起' : '查看预研卡'}</span>
          </button>
          {expanded ? <div className="research-card__detail"><div><span>优先载体</span><strong>{item.vehicle}</strong><p>{meta.note}</p></div><div><span>升级触发</span><p>{item.trigger}</p></div><div className="research-card__stop"><span>停止条件</span><p>{item.stop}</p></div></div> : null}
        </article>
      })}
    </section>
    <section className="research-pool__gate">{[['01','可相信','社会认知真实形成，标签与资产暴露一致。'],['02','可实现','容量、流动性、复制与运营能够承载规模。'],['03','可负责','回撤情景、目标客户和退出路径能够解释。'],['04','产品位置','旗舰、差异化或组合接口必须清晰。'],['05','退出纪律','停止申报、转型和清理条件提前写明。']].map(([n,title,text]) => <div key={n}><span>{n}</span><strong>{title}</strong><p>{text}</p></div>)}</section>
  </main>
}
