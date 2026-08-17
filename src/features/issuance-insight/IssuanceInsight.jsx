import { useEffect, useMemo, useState } from 'react'
import { fetchIssuanceInsights } from './issuanceData.js'
import './issuanceInsight.css'

const WINDOWS = [
  ['today', '当日'],
  ['week', '近一周'],
  ['quarter', '近三个月'],
  ['ytd', '今年以来'],
]

const number = (value, suffix = '') => value === null || value === undefined
  ? '—'
  : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`

export function IssuanceInsight() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [windowKey, setWindowKey] = useState('quarter')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchIssuanceInsights(fetch, { signal: controller.signal })
      .then(setPayload)
      .catch((reason) => reason?.name !== 'AbortError' && setError(reason.message))
    return () => controller.abort()
  }, [])

  const ranking = useMemo(() => {
    const value = query.trim().toLowerCase()
    return (payload?.rankings?.[windowKey] ?? []).filter((fund) => !value
      || [fund.code, fund.name, fund.manager, fund.type].some((field) => String(field ?? '').toLowerCase().includes(value)))
  }, [payload, query, windowKey])

  if (error) return <main className="issuance-shell"><div className="issuance-error"><h2>发行洞察暂不可用</h2><p>{error}</p><p>系统不会用空数据覆盖上一份有效快照。</p></div></main>
  if (!payload) return <main className="issuance-shell"><div className="issuance-loading">正在加载发行市场数据…</div></main>

  const summary = payload.summary
  return <main className="issuance-shell">
    <header className="issuance-hero">
      <div>
        <span className="issuance-kicker">公募基金产品经理工作台</span>
        <h1>基金发行市场洞察</h1>
        <p>聚焦新发、成立表现与暂停申购，先回答市场状况，再寻找产品机会。</p>
      </div>
      <div className="issuance-date"><strong>数据截至 {payload.dataDate}</strong><span>免费公开数据 · 产品级去重</span></div>
    </header>

    <section className="issuance-metrics" aria-label="发行市场概览">
      {[
        ['认购中', summary.todayOffering, '当前募集窗口'],
        ['今日成立', summary.todayEstablished, '产品数'],
        ['近一周成立', summary.weekEstablished, '产品数'],
        ['近三个月成立', summary.quarterEstablished, '产品数'],
        ['今年以来成立', summary.ytdEstablished, '产品数'],
        ['当前暂停申购', summary.currentSuspended, '按产品去重'],
      ].map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{number(value)}</strong><small>{hint}</small></article>)}
    </section>

    <section className="issuance-panel">
      <div className="issuance-panel__heading">
        <div><span className="issuance-section-index">01</span><h2>发行成功榜</h2><p>短周期偏重募集规模，近三个月及年内兼顾成立以来收益。</p></div>
        <input aria-label="搜索发行基金" placeholder="基金名称、代码、管理人" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="issuance-tabs" role="tablist">
        {WINDOWS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={windowKey === key} className={windowKey === key ? 'active' : ''} onClick={() => setWindowKey(key)}>{label}</button>)}
      </div>
      <div className="issuance-table-wrap">
        <table>
          <thead><tr><th>排名</th><th>基金/代表份额</th><th>类型</th><th>成立日期</th><th>募集份额</th><th>成立以来收益</th><th>最新规模</th><th>综合分</th></tr></thead>
          <tbody>{ranking.slice(0, 20).map((fund, index) => <tr key={fund.code}>
            <td><b className="rank-number">{index + 1}</b></td>
            <td><strong>{fund.name}</strong><span className="cell-note">{fund.code} · {fund.manager || '管理人待补全'}</span></td>
            <td>{fund.type}</td><td>{fund.establishedDate}</td>
            <td>{number(fund.raisedSharesYi, ' 亿份')}</td>
            <td className={(fund.returnSinceInceptionPercent ?? 0) >= 0 ? 'positive' : 'negative'}>{number(fund.returnSinceInceptionPercent, '%')}</td>
            <td>{fund.latestScaleYi === null ? <span className="pending-value">待补全</span> : number(fund.latestScaleYi, ' 亿元')}</td>
            <td><strong>{number(fund.successScore)}</strong></td>
          </tr>)}</tbody>
        </table>
        {ranking.length === 0 ? <div className="issuance-empty">该时间窗口暂无可用成立数据</div> : null}
      </div>
      <p className="issuance-method">{windowKey === 'today' || windowKey === 'week' ? payload.methodology.shortWindow : payload.methodology.longWindow}。{payload.methodology.warning}</p>
    </section>

    <div className="issuance-two-column">
      <section className="issuance-panel">
        <div className="issuance-panel__heading"><div><span className="issuance-section-index">02</span><h2>当前认购中</h2><p>展示募集窗口与基础认购条件。</p></div></div>
        <div className="issuance-list">{payload.offerings.ongoing.slice(0, 8).map((fund) => <article key={fund.code}>
          <div><strong>{fund.name}</strong><span>{fund.code} · {fund.type}</span></div>
          <p>{fund.offeringStartDate} — {fund.offeringEndDate || '待公告'}</p>
        </article>)}{payload.offerings.ongoing.length === 0 ? <div className="issuance-empty">今日暂无认购中数据</div> : null}</div>
      </section>

      <section className="issuance-panel">
        <div className="issuance-panel__heading"><div><span className="issuance-section-index">03</span><h2>暂停申购追踪</h2><p>当前状态快照；历史变化从本版本开始每日积累。</p></div></div>
        <div className="issuance-list suspension-list">{payload.suspensions.slice(0, 8).map((fund) => <article key={fund.productId}>
          <div><strong>{fund.productName}</strong><span>{fund.representativeCode} · {fund.type}</span></div>
          <em>{fund.purchaseStatus}</em>
          <p>净值日 {fund.lastNetValueDate || '待补全'} · 日涨跌 {number(fund.dailyChangePercent, '%')}</p>
        </article>)}{payload.suspensions.length === 0 ? <div className="issuance-empty">当前未识别到暂停申购产品</div> : null}</div>
      </section>
    </div>
  </main>
}
