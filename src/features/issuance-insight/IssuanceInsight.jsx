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

const PAGE_SIZE = 20

const METRIC_DESTINATIONS = {
  offering: { hash: 'ongoing-offerings', sectionId: 'ongoing-offerings' },
  today: { hash: 'established-today', sectionId: 'issuance-ranking', windowKey: 'today' },
  week: { hash: 'established-week', sectionId: 'issuance-ranking', windowKey: 'week' },
  quarter: { hash: 'established-quarter', sectionId: 'issuance-ranking', windowKey: 'quarter' },
  ytd: { hash: 'established-ytd', sectionId: 'issuance-ranking', windowKey: 'ytd' },
  suspended: { hash: 'purchase-suspensions', sectionId: 'purchase-suspensions' },
}

const HASH_DESTINATIONS = Object.fromEntries(
  Object.entries(METRIC_DESTINATIONS).map(([key, destination]) => [destination.hash, { key, ...destination }]),
)

function Pager({ page, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (total <= PAGE_SIZE) return total ? <div className="issuance-pager"><span>共 {total} 条</span></div> : null
  return <div className="issuance-pager">
    <span>共 {total} 条 · 第 {page}/{pages} 页</span>
    <div><button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>上一页</button><button type="button" disabled={page === pages} onClick={() => onChange(page + 1)}>下一页</button></div>
  </div>
}

export function IssuanceInsight() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [windowKey, setWindowKey] = useState('quarter')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('establishedDate')
  const [rankingPage, setRankingPage] = useState(1)
  const [offeringPage, setOfferingPage] = useState(1)
  const [suspensionPage, setSuspensionPage] = useState(1)
  const [growthPage, setGrowthPage] = useState(1)
  const [growthCohort, setGrowthCohort] = useState('all')
  const [growthSort, setGrowthSort] = useState('scaleGrowthPercent')

  const navigateToMetric = (metricKey, { updateHistory = true } = {}) => {
    const destination = METRIC_DESTINATIONS[metricKey]
    if (!destination) return
    if (destination.windowKey) setWindowKey(destination.windowKey)
    if (updateHistory && window.location.hash !== `#${destination.hash}`) {
      window.history.pushState(null, '', `#${destination.hash}`)
    }
    window.requestAnimationFrame(() => {
      document.getElementById(destination.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  useEffect(() => {
    const applyHash = () => {
      const destination = HASH_DESTINATIONS[window.location.hash.slice(1)]
      if (destination) navigateToMetric(destination.key, { updateHistory: false })
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

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
      .sort((left, right) => sortKey === 'establishedDate'
        ? String(right.establishedDate).localeCompare(String(left.establishedDate)) || left.code.localeCompare(right.code)
        : (right[sortKey] ?? -Infinity) - (left[sortKey] ?? -Infinity) || left.code.localeCompare(right.code))
  }, [payload, query, sortKey, windowKey])

  const growthProducts = useMemo(() => {
    const products = payload?.scaleGrowth?.products ?? []
    return products.filter((fund) => growthCohort === 'all'
      || (growthCohort === 'd30' && fund.ageDays >= 30)
      || (growthCohort === 'd90' && fund.ageDays >= 90))
      .sort((left, right) => (right[growthSort] ?? -Infinity) - (left[growthSort] ?? -Infinity) || left.code.localeCompare(right.code))
  }, [growthCohort, growthSort, payload])

  useEffect(() => setRankingPage(1), [query, sortKey, windowKey])
  useEffect(() => setGrowthPage(1), [growthCohort, growthSort])

  const page = (items, current) => items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

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
        ['offering', '认购中', summary.todayOffering, '当前募集窗口'],
        ['today', '今日成立', summary.todayEstablished, '产品数'],
        ['week', '近一周成立', summary.weekEstablished, '产品数'],
        ['quarter', '近三个月成立', summary.quarterEstablished, '产品数'],
        ['ytd', '今年以来成立', summary.ytdEstablished, '产品数'],
        ['suspended', '当前暂停申购', summary.currentSuspended, '按产品去重'],
      ].map(([key, label, value, hint]) => <button
        key={key}
        type="button"
        aria-label={`查看${label}明细`}
        onClick={() => navigateToMetric(key)}
      ><span>{label}</span><strong>{number(value)}</strong><small>{hint}</small><i aria-hidden="true">查看明细 →</i></button>)}
    </section>

    <section className="issuance-panel issuance-anchor" id="issuance-ranking">
      <div className="issuance-panel__heading">
        <div><span className="issuance-section-index">01</span><h2>发行成功榜</h2><p>短周期偏重募集规模，近三个月及年内兼顾成立以来收益。</p></div>
        <div className="issuance-controls"><select aria-label="排序指标" value={sortKey} onChange={(event) => setSortKey(event.target.value)}><option value="establishedDate">按成立日期（最新）</option><option value="raisedSharesYi">按募集份额</option><option value="latestScaleYi">按最新规模</option><option value="dailyReturnPercent">按日涨跌幅</option><option value="weekReturnPercent">按近一周收益</option><option value="monthReturnPercent">按近一月收益</option><option value="quarterReturnPercent">按近三月收益</option><option value="ytdReturnPercent">按今年以来收益</option><option value="returnSinceInceptionPercent">按成立以来收益</option></select><input aria-label="搜索发行基金" placeholder="基金名称、代码、管理人" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      </div>
      <div className="issuance-tabs" role="tablist">
        {WINDOWS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={windowKey === key} className={windowKey === key ? 'active' : ''} onClick={() => setWindowKey(key)}>{label}</button>)}
      </div>
      <div className="issuance-table-wrap">
        <table>
          <thead><tr><th>排名</th><th>基金/代表份额</th><th>成立日期</th><th>单位净值</th><th>日涨跌</th><th>近一周</th><th>近一月</th><th>近三月</th><th>今年来</th><th>成立来</th><th>募集份额</th><th>最新规模</th></tr></thead>
          <tbody>{page(ranking, rankingPage).map((fund, index) => <tr key={fund.code}>
            <td><b className="rank-number">{(rankingPage - 1) * PAGE_SIZE + index + 1}</b></td>
            <td><strong>{fund.name}</strong><span className="cell-note">{fund.code} · {fund.manager || '管理人待补全'}</span></td>
            <td>{fund.establishedDate}</td>
            <td>{number(fund.unitNav)}<span className="cell-note">{fund.navDate || '待更新'}</span></td>
            {[fund.dailyReturnPercent, fund.weekReturnPercent, fund.monthReturnPercent, fund.quarterReturnPercent, fund.ytdReturnPercent].map((value, metricIndex) => <td key={metricIndex} className={(value ?? 0) >= 0 ? 'positive' : 'negative'}>{number(value, '%')}</td>)}
            <td className={(fund.returnSinceInceptionPercent ?? 0) >= 0 ? 'positive' : 'negative'}>{number(fund.returnSinceInceptionPercent, '%')}</td>
            <td>{number(fund.raisedSharesYi, ' 亿份')}</td>
            <td>{fund.latestScaleYi === null ? <span className="pending-value">待披露</span> : <>{number(fund.latestScaleYi, ' 亿元')}<span className="cell-note">{fund.latestScaleStatus || '估算'} · {fund.latestScaleDate || '日期待补全'}</span></>}</td>
          </tr>)}</tbody>
        </table>
        {ranking.length === 0 ? <div className="issuance-empty">该时间窗口暂无可用成立数据</div> : null}
      </div>
      <Pager page={rankingPage} total={ranking.length} onChange={setRankingPage} />
      <p className="issuance-method">{windowKey === 'today' || windowKey === 'week' ? payload.methodology.shortWindow : payload.methodology.longWindow}。{payload.methodology.warning}</p>
    </section>

    <section className="issuance-panel issuance-anchor" id="post-launch-scale">
      <div className="issuance-panel__heading">
        <div><span className="issuance-section-index">02</span><h2>发行后规模追踪</h2><p>按产品合并 A/C 等份额，识别今年以来成立且规模增加的基金；成立规模以募集份额按面值 1 元近似。</p></div>
        <div className="issuance-controls">
          <select aria-label="规模观察期" value={growthCohort} onChange={(event) => setGrowthCohort(event.target.value)}><option value="all">全部成立产品</option><option value="d30">成立满30日</option><option value="d90">成立满90日</option></select>
          <select aria-label="规模增长排序" value={growthSort} onChange={(event) => setGrowthSort(event.target.value)}><option value="scaleGrowthPercent">按增长率</option><option value="scaleGrowthYi">按增长额</option><option value="latestScaleYi">按当前规模</option></select>
        </div>
      </div>
      <div className="scale-growth-summary">
        <article><span>可比较产品</span><strong>{number(payload.scaleGrowth?.comparableCount)}</strong></article>
        <article><span>规模增加</span><strong>{number(payload.scaleGrowth?.increasedCount)}</strong></article>
        <article><span>日频历史起点</span><strong>{payload.scaleGrowth?.historyStartDate || '待积累'}</strong></article>
      </div>
      <div className="issuance-table-wrap scale-growth-table">
        <table>
          <thead><tr><th>排名</th><th>基金产品</th><th>成立日期/天数</th><th>成立规模</th><th>当前规模</th><th>增加额</th><th>增加率</th><th>D+30</th><th>D+90</th></tr></thead>
          <tbody>{page(growthProducts, growthPage).map((fund, index) => <tr key={fund.productId}>
            <td><b className="rank-number">{(growthPage - 1) * PAGE_SIZE + index + 1}</b></td>
            <td><strong>{fund.name}</strong><span className="cell-note">{fund.code} · {fund.shareCount}个份额</span></td>
            <td>{fund.establishedDate}<span className="cell-note">成立 {fund.ageDays} 日</span></td>
            <td>{number(fund.initialScaleYi, ' 亿元')}<span className="cell-note">募集份额×面值近似</span></td>
            <td>{number(fund.latestScaleYi, ' 亿元')}<span className="cell-note">{fund.latestScaleDate || '日期待补全'}</span></td>
            <td className={(fund.scaleGrowthYi ?? 0) >= 0 ? 'positive' : 'negative'}>{number(fund.scaleGrowthYi, ' 亿元')}</td>
            <td className={(fund.scaleGrowthPercent ?? 0) >= 0 ? 'positive' : 'negative'}><strong>{number(fund.scaleGrowthPercent, '%')}</strong></td>
            <td>{fund.milestone30}<span className="cell-note">定点值待历史回补</span></td>
            <td>{fund.milestone90}<span className="cell-note">定点值待历史回补</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      <Pager page={growthPage} total={growthProducts.length} onChange={setGrowthPage} />
      <div className="growth-patterns">
        {(payload.scaleGrowth?.patterns ?? []).slice(0, 6).map((pattern) => <article key={pattern.dimension}>
          <span>{pattern.dimension} · {pattern.sampleCount}个样本</span>
          <strong>增长中位数 {number(pattern.medianGrowthPercent, '%')}</strong>
          <p>规模正增长比例 {number(pattern.positiveSharePercent, '%')}</p>
          <small>领先产品：{pattern.topFunds.join('、') || '暂无'}</small>
        </article>)}
      </div>
      <p className="issuance-method">当前范围：{payload.scaleGrowth?.scope || '今年以来成立'}。当前增长率用于发现线索，不代表资金净流入；市场涨跌也会改变基金规模。D+30/D+90定点规模将在历史快照与季度报告回补后开放。</p>
    </section>

    <div className="issuance-two-column">
      <section className="issuance-panel issuance-anchor" id="ongoing-offerings">
        <div className="issuance-panel__heading"><div><span className="issuance-section-index">03</span><h2>当前认购中</h2><p>展示募集窗口与基础认购条件。</p></div></div>
        <div className="issuance-list">{page(payload.offerings.ongoing, offeringPage).map((fund) => <article key={fund.code}>
          <div><strong>{fund.name}</strong><span>{fund.code} · {fund.type}</span></div>
          <p>{fund.offeringStartDate} — {fund.offeringEndDate || '待公告'}</p>
        </article>)}{payload.offerings.ongoing.length === 0 ? <div className="issuance-empty">今日暂无认购中数据</div> : null}</div>
        <Pager page={offeringPage} total={payload.offerings.ongoing.length} onChange={setOfferingPage} />
      </section>

      <section className="issuance-panel issuance-anchor" id="purchase-suspensions">
        <div className="issuance-panel__heading"><div><span className="issuance-section-index">04</span><h2>暂停申购追踪</h2><p>当前状态快照；历史变化从本版本开始每日积累。</p></div></div>
        <div className="issuance-list suspension-list">{page(payload.suspensions, suspensionPage).map((fund) => <article key={fund.productId}>
          <div><strong>{fund.productName}</strong><span>{fund.representativeCode} · {fund.type}</span></div>
          <em>{fund.purchaseStatus}</em>
          <p>净值日 {fund.lastNetValueDate || '待补全'} · 日涨跌 {number(fund.dailyChangePercent, '%')}</p>
        </article>)}{payload.suspensions.length === 0 ? <div className="issuance-empty">当前未识别到暂停申购产品</div> : null}</div>
        <Pager page={suspensionPage} total={payload.suspensions.length} onChange={setSuspensionPage} />
      </section>
    </div>
  </main>
}
