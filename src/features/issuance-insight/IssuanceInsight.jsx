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

const milestoneValue = (milestone) => {
  if (!milestone || milestone.status === 'pending') return <span className="pending-value">待历史披露</span>
  if (milestone.status === 'upcoming') return <>还需 {milestone.daysRemaining} 日</>
  return <>{number(milestone.scaleYi, ' 亿元')}<span className="cell-note">观察于D+{milestone.observationAgeDays} · {number(milestone.growthPercent, '%')}</span></>
}

const METRIC_DESTINATIONS = {
  offering: { hash: 'ongoing-offerings', sectionId: 'ongoing-offerings' },
  upcoming: { hash: 'upcoming-offerings', sectionId: 'upcoming-offerings' },
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
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [suspensionPage, setSuspensionPage] = useState(1)
  const [growthPage, setGrowthPage] = useState(1)
  const [growthCohort, setGrowthCohort] = useState('all')
  const [growthSort, setGrowthSort] = useState('scaleGrowthPercent')
  const [growthDimension, setGrowthDimension] = useState('板块')
  const [selectedGrowthGroup, setSelectedGrowthGroup] = useState(null)
  const [showAllGrowthGroups, setShowAllGrowthGroups] = useState(false)
  const [futureDimension, setFutureDimension] = useState('板块')
  const [suspensionDimension, setSuspensionDimension] = useState('板块')
  const [expandedGrowthIds, setExpandedGrowthIds] = useState(() => new Set())

  const navigateToMetric = (metricKey, { updateHistory = true } = {}) => {
    const destination = METRIC_DESTINATIONS[metricKey]
    if (!destination) return
    if (destination.windowKey) setWindowKey(destination.windowKey)
    if (updateHistory && window.location.hash !== `#${destination.hash}`) {
      window.history.pushState(null, '', `#${destination.hash}`)
    }
    window.requestAnimationFrame(() => {
      const element = document.getElementById(destination.sectionId)
      element?.closest('details')?.setAttribute('open', '')
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  const growthProductById = useMemo(() => new Map(
    (payload?.scaleGrowth?.products ?? []).map((product) => [product.productId, product]),
  ), [payload])
  const activeGrowthAnalysis = (payload?.scaleGrowth?.dimensionAnalysis ?? []).find((analysis) => analysis.dimension === growthDimension)
  const activeGrowthGroup = activeGrowthAnalysis?.groups.find((group) => group.label === selectedGrowthGroup)
  const activeFutureAnalysis = (payload?.futureIssuance?.dimensionAnalysis ?? []).find((analysis) => analysis.dimension === futureDimension)
  const activeSuspensionAnalysis = (payload?.suspensionAnalysis?.dimensionAnalysis ?? []).find((analysis) => analysis.dimension === suspensionDimension)
  const futureOngoing = (payload?.futureIssuance?.products ?? []).filter((product) => product.status === '认购中')
  const futureUpcoming = (payload?.futureIssuance?.products ?? []).filter((product) => product.status === '待发行')

  useEffect(() => setRankingPage(1), [query, sortKey, windowKey])
  useEffect(() => setGrowthPage(1), [growthCohort, growthSort])

  const page = (items, current) => items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const toggleGrowth = (productId) => setExpandedGrowthIds((current) => {
    const next = new Set(current)
    if (next.has(productId)) next.delete(productId)
    else next.add(productId)
    return next
  })

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
        ['upcoming', '待发行预告', summary.upcomingOffering, '已披露份额'],
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
      <details className="data-disclosure"><summary>展开当前窗口明细 · {ranking.length}只基金</summary><div className="issuance-table-wrap">
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
      <Pager page={rankingPage} total={ranking.length} onChange={setRankingPage} /></details>
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
      <div className="coverage-quadrants" aria-label="历史覆盖与有效可比四象限">
        {(payload.scaleGrowth?.quadrants ?? []).map((quadrant) => <article key={quadrant.key}>
          <span>{quadrant.key}</span><strong>{number(quadrant.count)}</strong><small>产品</small>
        </article>)}
      </div>
      <details className="data-disclosure"><summary>展开规模追踪明细 · {growthProducts.length}只产品</summary><div className="issuance-table-wrap scale-growth-table">
        <table>
          <thead><tr><th>排名</th><th>基金产品</th><th>成立日期/天数</th><th>成立规模</th><th>当前规模</th><th>增加额</th><th>增加率</th><th>D+30</th><th>D+90</th></tr></thead>
          <tbody>{page(growthProducts, growthPage).flatMap((fund, index) => {
            const expanded = expandedGrowthIds.has(fund.productId)
            const maxScale = Math.max(...(fund.scaleHistory ?? []).map((point) => point.scaleYi), 1)
            return [<tr key={fund.productId}>
              <td><b className="rank-number">{(growthPage - 1) * PAGE_SIZE + index + 1}</b></td>
              <td><strong>{fund.name}</strong><span className="cell-note">{fund.code} · {fund.shareCount}个份额</span><button className="trajectory-toggle" type="button" aria-expanded={expanded} aria-controls={`trajectory-${fund.productId}`} onClick={() => toggleGrowth(fund.productId)}>{expanded ? '收起轨迹' : '查看规模轨迹'}</button></td>
              <td>{fund.establishedDate}<span className="cell-note">成立 {fund.ageDays} 日</span></td>
              <td>{number(fund.initialScaleYi, ' 亿元')}<span className="cell-note">募集份额×面值近似</span></td>
              <td>{number(fund.latestScaleYi, ' 亿元')}<span className="cell-note">{fund.latestScaleDate || '日期待补全'}</span></td>
              <td className={(fund.scaleGrowthYi ?? 0) >= 0 ? 'positive' : 'negative'}>{number(fund.scaleGrowthYi, ' 亿元')}</td>
              <td className={(fund.scaleGrowthPercent ?? 0) >= 0 ? 'positive' : 'negative'}><strong>{number(fund.scaleGrowthPercent, '%')}</strong></td>
              <td>{milestoneValue(fund.d30)}</td>
              <td>{milestoneValue(fund.d90)}</td>
            </tr>, expanded ? <tr className="trajectory-row" key={`${fund.productId}-trajectory`}><td colSpan="9"><div id={`trajectory-${fund.productId}`} className="scale-trajectory"><div className="trajectory-heading"><strong>正式披露规模轨迹</strong><span>成立基准 + 季度披露点；仅合并份额覆盖完整的日期</span></div><div className="trajectory-points">{(fund.scaleHistory ?? []).map((point) => <article key={point.date}><span>{point.date}</span><div><i style={{ width: `${Math.max(4, point.scaleYi / maxScale * 100)}%` }} /></div><strong>{number(point.scaleYi, '亿元')}</strong></article>)}</div></div></td></tr> : null]
          })}</tbody>
        </table>
      </div>
      <Pager page={growthPage} total={growthProducts.length} onChange={setGrowthPage} /></details>
      <div className="growth-analysis-heading"><div><strong>增长规律分析</strong><span>五个维度统一使用“有效可比”产品全集</span></div><div className="issuance-tabs" role="tablist">
        {(payload.scaleGrowth?.dimensionAnalysis ?? []).map((analysis) => <button key={analysis.dimension} type="button" role="tab" aria-selected={growthDimension === analysis.dimension} className={growthDimension === analysis.dimension ? 'active' : ''} onClick={() => { setGrowthDimension(analysis.dimension); setSelectedGrowthGroup(null); setShowAllGrowthGroups(false) }}>{analysis.dimension}</button>)}
      </div></div>
      <p className="growth-dimension-summary">{activeGrowthAnalysis?.summary || '该维度暂无有效可比样本。'}</p>
      <div className="growth-patterns">
        {(activeGrowthAnalysis?.groups ?? []).slice(0, showAllGrowthGroups ? undefined : 8).map((pattern) => <article key={pattern.label}>
          <span>{pattern.label} · {pattern.sampleCount}个样本</span>
          <strong>增长中位数 {number(pattern.medianGrowthPercent, '%')}</strong>
          <p>规模正增长比例 {number(pattern.positiveSharePercent, '%')}</p>
          <small>领先产品：{pattern.topFunds.join('、') || '暂无'}</small>
          <button type="button" aria-expanded={activeGrowthGroup?.label === pattern.label} onClick={() => setSelectedGrowthGroup((current) => current === pattern.label ? null : pattern.label)}>{activeGrowthGroup?.label === pattern.label ? '收起样本' : `查看全部${pattern.sampleCount}个样本`}</button>
        </article>)}
      </div>
      {(activeGrowthAnalysis?.groups.length ?? 0) > 8 ? <button className="growth-groups-toggle" type="button" onClick={() => setShowAllGrowthGroups((current) => !current)}>{showAllGrowthGroups ? '收起分组' : `展开全部${activeGrowthAnalysis.groups.length}组`}</button> : null}
      {activeGrowthGroup ? <div className="growth-sample-detail">
        <div className="trajectory-heading"><strong>{growthDimension} · {activeGrowthGroup.label}：完整样本</strong><span>按增长率从低到高排列；{activeGrowthGroup.medianProductIds.length === 2 ? '两条浅黄色记录的平均值' : '浅黄色记录'}为中位数</span></div>
        <div className="issuance-table-wrap"><table><thead><tr><th>序位</th><th>基金产品</th><th>成立日期</th><th>首发规模</th><th>当前规模</th><th>增长额</th><th>增长率</th><th>中位数位置</th></tr></thead><tbody>
          {activeGrowthGroup.productIds.map((productId, index) => {
            const fund = growthProductById.get(productId)
            if (!fund) return null
            const isMedian = activeGrowthGroup.medianProductIds.includes(productId)
            return <tr key={productId} className={isMedian ? 'median-sample' : ''}><td>{index + 1}</td><td><strong>{fund.name}</strong><span className="cell-note">{fund.code}</span></td><td>{fund.establishedDate}</td><td>{number(fund.initialScaleYi, ' 亿元')}</td><td>{number(fund.latestScaleYi, ' 亿元')}</td><td>{number(fund.scaleGrowthYi, ' 亿元')}</td><td className={(fund.scaleGrowthPercent ?? 0) >= 0 ? 'positive' : 'negative'}><strong>{number(fund.scaleGrowthPercent, '%')}</strong></td><td>{isMedian ? '中位数边界' : '—'}</td></tr>
          })}
        </tbody></table></div>
      </div> : null}
      <p className="issuance-method">当前范围：{payload.scaleGrowth?.scope || '今年以来成立'}。D+30/D+90取目标日附近60天内最近的正式披露点，并明确实际观察日；当前增长率用于发现线索，不代表资金净流入。</p>
    </section>

    <section className="issuance-panel issuance-anchor" id="future-issuance">
      <div className="issuance-panel__heading"><div><span className="issuance-section-index">03</span><h2>未来发行趋势</h2><p>合并当前认购中与待发行预告，按产品去重，帮助判断未来供给和同类拥挤。</p></div></div>
      <div className="future-issuance-summary">
        <article><span>未来发行产品</span><strong>{number(payload.futureIssuance?.totalCount)}</strong></article>
        <article><span>当前认购中</span><strong>{number(payload.futureIssuance?.ongoingCount)}</strong></article>
        <article><span>待发行预告</span><strong>{number(payload.futureIssuance?.upcomingCount)}</strong></article>
        <article><span>原始披露份额</span><strong>{number(payload.futureIssuance?.shareClassCount)}</strong></article>
      </div>
      <p className="growth-dimension-summary">{payload.futureIssuance?.summary}</p>
      <div className="growth-analysis-heading"><div><strong>未来供给结构</strong><span>认购中与待发行使用统一产品级管线</span></div><div className="issuance-tabs" role="tablist">
        {(payload.futureIssuance?.dimensionAnalysis ?? []).map((analysis) => <button key={analysis.dimension} type="button" role="tab" aria-selected={futureDimension === analysis.dimension} className={futureDimension === analysis.dimension ? 'active' : ''} onClick={() => setFutureDimension(analysis.dimension)}>{analysis.dimension}</button>)}
      </div></div>
      <p className="future-analysis-summary">{activeFutureAnalysis?.summary}</p>
      <div className="future-patterns">{(activeFutureAnalysis?.groups ?? []).slice(0, 8).map((group) => <article key={group.label}>
        <span>{group.label}</span><strong>{group.productCount}只产品 · {number(group.pipelineSharePercent, '%')}</strong><p>认购中 {group.ongoingCount} · 待发行 {group.upcomingCount}</p><small>{group.topProducts.join('、')}</small>
      </article>)}</div>
      <div className="issuance-two-column future-offering-lists">
        <details className="data-disclosure"><summary id="ongoing-offerings">当前认购中 · {futureOngoing.length}只产品</summary><div className="issuance-list">{page(futureOngoing, offeringPage).map((fund) => <article key={fund.productId}><div><strong>{fund.name}</strong><span>{fund.code} · {fund.shareCount}个份额</span></div><p>{fund.offeringStartDate} — {fund.offeringEndDate || '待公告'} · {fund.manager || '管理人待补全'}</p></article>)}</div><Pager page={offeringPage} total={futureOngoing.length} onChange={setOfferingPage} /></details>
        <details className="data-disclosure"><summary id="upcoming-offerings">待发行预告 · {futureUpcoming.length}只产品</summary><div className="issuance-list">{page(futureUpcoming, upcomingPage).map((fund) => <article key={fund.productId}><div><strong>{fund.name}</strong><span>{fund.code} · {fund.shareCount}个份额</span></div><p>{fund.offeringStartDate} 起 · {fund.manager || '管理人待补全'}</p></article>)}</div><Pager page={upcomingPage} total={futureUpcoming.length} onChange={setUpcomingPage} /></details>
      </div>
    </section>

    <section className="issuance-panel issuance-anchor" id="purchase-suspensions">
        <div className="issuance-panel__heading"><div><span className="issuance-section-index">04</span><h2>暂停申购结构分析</h2><p>先看集中分布，再按需展开产品；公开快照没有暂停公告原因。</p></div></div>
        <p className="growth-dimension-summary">{payload.suspensionAnalysis?.scope}</p>
        <div className="growth-analysis-heading"><div><strong>暂停产品结构</strong><span>共{number(payload.suspensionAnalysis?.totalCount)}只产品</span></div><div className="issuance-tabs" role="tablist">{(payload.suspensionAnalysis?.dimensionAnalysis ?? []).map((analysis) => <button key={analysis.dimension} type="button" role="tab" aria-selected={suspensionDimension === analysis.dimension} className={suspensionDimension === analysis.dimension ? 'active' : ''} onClick={() => setSuspensionDimension(analysis.dimension)}>{analysis.dimension}</button>)}</div></div>
        <p className="future-analysis-summary">{activeSuspensionAnalysis?.summary}</p>
        <div className="future-patterns">{(activeSuspensionAnalysis?.groups ?? []).slice(0, 8).map((group) => <article key={group.label}><span>{group.label}</span><strong>{group.productCount}只 · {number(group.sharePercent, '%')}</strong><small>{group.examples.join('、')}</small></article>)}</div>
        <details className="data-disclosure"><summary>展开暂停申购产品明细 · {payload.suspensions.length}只</summary><div className="issuance-list suspension-list">{page(payload.suspensions, suspensionPage).map((fund) => <article key={fund.productId}>
          <div><strong>{fund.productName}</strong><span>{fund.representativeCode} · {fund.type}</span></div>
          <em>{fund.purchaseStatus}</em>
          <p>净值日 {fund.lastNetValueDate || '待补全'} · 产品规模 {number(fund.scaleYi, '亿元')} · {fund.shareCount}个份额</p>
        </article>)}{payload.suspensions.length === 0 ? <div className="issuance-empty">当前未识别到暂停申购产品</div> : null}</div>
        <Pager page={suspensionPage} total={payload.suspensions.length} onChange={setSuspensionPage} /></details>
    </section>
      {payload.exitRisk?.ytdAbnormalProducts > 0 ? <section className="issuance-panel issuance-anchor" id="exit-risk">
        <div className="issuance-panel__heading"><div><span className="issuance-section-index">05</span><h2>今年异常退出跟踪</h2><p>只统计今年以来首次进入异常隔离名单的产品，不把历史停更存量当作今年清盘。</p></div></div>
        <div className="exit-risk-summary"><article><span>今年新增异常产品</span><strong>{number(payload.exitRisk?.ytdAbnormalProducts)}</strong></article><article><span>确认终止</span><strong>{number(payload.exitRisk?.ytdConfirmedTerminated)}</strong></article><article><span>疑似长期停更</span><strong>{number(payload.exitRisk?.ytdSuspectedTerminated)}</strong></article></div>
        <p className="risk-baseline">跟踪前基线：{number(payload.exitRisk?.baselineProducts)}只产品 / {number(payload.exitRisk?.baselineShareClasses)}个份额。该基线仅用于后续识别新增变化。</p>
        <p className="issuance-method">{payload.exitRisk?.scope}</p>
      </section> : null}
  </main>
}
