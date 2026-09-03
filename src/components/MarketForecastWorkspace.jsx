import { useEffect, useMemo, useState } from 'react'
import { compactMarketForecastFacts, hydrateMarketForecastSnapshot } from '../data/marketForecast.js'
import { DATA_STATUS_POLL_MS, fetchDataStatus } from '../data/dataStatus.js'
import { ReportScope } from './ReportScope.jsx'
import { useDynamicAnalysis } from '../data/dynamicAnalysis.js'
import { DynamicAnalysisPanel } from './DynamicAnalysisPanel.jsx'

const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'
const scale = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)} 亿元` : '—'

function ForecastModelAnalysis({ forecast, researchSnapshot }) {
  const researchPool = useMemo(() => {
    const itemMap = new Map((researchSnapshot?.items || []).map((item) => [item.id, item]))
    return (researchSnapshot?.recommendedIds || []).slice(0, 10).map((id, index) => {
      const item = itemMap.get(id) || {}
      return { rank: index + 1, id, attentionScore: item.attention?.score, lifecycle: item.lifecycle?.state, scaleNetIncreaseYi: item.validation?.scaleNetIncreaseYi, scaleGrowthPercent: item.validation?.scaleGrowthPercent, launched12Months: item.validation?.launched12Months }
    })
  }, [researchSnapshot])
  const facts = useMemo(() => ({ marketFundStructure: compactMarketForecastFacts(forecast), researchPool: { generatedAt: researchSnapshot?.generatedAt, ranking: researchPool }, analysisRequirement: '联合判断公募资金、收益回撤与预研产品池方向变化；只依据所给事实，不补造宏观数据。' }), [forecast, researchPool, researchSnapshot?.generatedAt])
  const fallback = useMemo(() => ({ headline: `${forecast.baseline.regime}：公募资金与预研方向需要联合验证`, overallJudgment: `${forecast.baseline.interpretation}${researchPool.length ? ` 当前预研池已有${researchPool.length}个核心方向可用于交叉验证，但产品立项仍需检查资金承接与供给拥挤。` : ' 当前预研池数据暂未载入，先以公募基金结构信号为准。'}`, changeAttribution: [`收益领先方向为${forecast.leaders.return?.name || '待补充'}。`, `资金净流入领先方向为${forecast.leaders.inflow?.name || '待补充'}。`, researchPool.length ? `预研池Top 10中${researchPool.filter((item)=>item.lifecycle==='拥挤观察').length}个方向处于拥挤观察。` : '预研方向排名等待数据载入。'], risks: ['高收益方向可能伴随更深阶段性回撤。', '规模披露时滞可能影响短期资金方向判断。', '预研注意力与公募资金可能存在时间错位，不能把热度直接等同产品需求。'], nextActions: [forecast.baseline.action, forecast.baseline.invalidation, '验证预研池领先方向是否同步获得基金规模净增和更广的正增长覆盖。'] }), [forecast, researchPool])
  const analysis = useDynamicAnalysis({ analysisKey: 'market-forecast', dataDate: forecast.dataDate, facts, fallback })
  return <DynamicAnalysisPanel analysis={analysis} title="整体策略与行情动态研判" />
}

export function MarketForecastWorkspace({ onOpenFundLibrary, agentCommand, onContextChange }) {
  const [forecast, setForecast] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState('tech')
  const [sort, setSort] = useState('nav')
  const [loadedUpdateTime, setLoadedUpdateTime] = useState('')
  const [researchSnapshot, setResearchSnapshot] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30_000)
    setLoadError('')
    Promise.all([
      fetch('/market_forecast.json', { signal: controller.signal, cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(`行情预测数据请求失败（${response.status}）`); return response.json() }),
      fetch('/attention_pool_evidence.json', { signal: controller.signal, cache: 'no-store' }).then((response) => response.ok ? response.json() : null).catch(() => null),
    ]).then(([payload, attentionPayload]) => {
        setForecast(hydrateMarketForecastSnapshot(payload))
        setResearchSnapshot(attentionPayload)
        setLoadedUpdateTime(payload.updateTime ?? '')
      })
      .catch((error) => {
        if (controller.signal.aborted && error?.name === 'AbortError') setLoadError('行情预测数据请求超时，请重新加载。')
        else if (error?.name !== 'AbortError') setLoadError(error?.message || '行情预测数据加载失败。')
      })
      .finally(() => window.clearTimeout(timeout))
    return () => controller.abort()
  }, [reloadKey])

  useEffect(() => {
    if (!loadedUpdateTime) return undefined
    const checkForUpdate = () => fetchDataStatus(fetch)
      .then((payload) => {
        if (payload.productsUpdateTime !== loadedUpdateTime) setReloadKey((value) => value + 1)
      })
      .catch(() => {})
    const interval = window.setInterval(checkForUpdate, DATA_STATUS_POLL_MS)
    const onVisibility = () => { if (document.visibilityState === 'visible') checkForUpdate() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadedUpdateTime])

  const selected = forecast?.rows.find((row) => row.id === selectedId) ?? forecast?.rows[0]
  useEffect(() => {
    if (agentCommand?.type !== 'forecast-category' || !forecast) return
    const target = forecast.rows.find((row) => row.id === agentCommand.categoryId || row.name === agentCommand.categoryName)
    if (target) {
      setSelectedId(target.id)
      requestAnimationFrame(() => document.querySelector('.forecast-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [agentCommand, forecast])
  useEffect(() => {
    if (!selected || !forecast) return
    onContextChange?.({ selectedCategory: { id: selected.id, name: selected.name, judgement: selected.judgement, navMedian: selected.navMedian, scaleNetIncrease: selected.scaleNetIncrease, drawdownMedian: selected.drawdownMedian }, sort, dataDate: forecast.dataDate })
  }, [forecast, onContextChange, selected, sort])
  const funds = useMemo(() => [...(selected?.funds ?? [])].sort((left, right) => {
    const field = sort === 'scale' ? 'scaleNetIncreaseYi' : sort === 'drawdown' ? 'maxDrawdownPercent' : 'navGrowthPercent'
    const a = Number.isFinite(left[field]) ? left[field] : -Infinity
    const b = Number.isFinite(right[field]) ? right[field] : -Infinity
    return b - a
  }).slice(0, 30), [selected, sort])

  if (!forecast && loadError) return <main className="workspace-main forecast-workspace"><header className="forecast-heading"><div><h1>行情预测</h1><p>正在读取每日基金快照</p></div></header><section className="empty-state" role="alert"><h2>行情预测加载失败</h2><p>{loadError}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button></section></main>
  if (!forecast) return <main className="workspace-main forecast-workspace"><header className="forecast-heading"><div><h1>行情预测</h1><p>正在读取每日基金快照</p></div></header><p>正在生成每日行情预测…</p></main>
  const leaders = forecast.leaders
  const baseline = forecast.baseline
  const openForecastRow = (row) => {
    if (!row) return
    setSelectedId(row.id)
    window.requestAnimationFrame(() => document.querySelector('.forecast-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  return <main className="workspace-main forecast-workspace">
    <header className="forecast-heading">
      <div><h1>行情预测</h1><p>以全市场公募基金的净值、回撤与规模变化为观测信号；数据日期 {forecast.dataDate}</p></div>
      <span>更新时间 {loadedUpdateTime || '待更新'}</span>
    </header>

    <ReportScope label="行情预测数据口径" items={[
      { term: '研究样本', description: '规模指标覆盖全部具备可比规模的存续产品；收益指标排除货币基金和非年初覆盖产品' },
      { term: '观测区间', description: `收益与回撤仅比较年初至${forecast.dataDate}的同区间样本；新基金不进入跨类型收益排名` },
      { term: '信号性质', description: `基于${forecast.dataDate}收盘后可得数据每日重算，用于判断当前市场状态，不代表下一交易日收益预测` },
    ]} />
    <ForecastModelAnalysis forecast={forecast} researchSnapshot={researchSnapshot} />

    <section className="forecast-conclusion" aria-label="核心结论">
      <h2>核心结论</h2>
      <p>当前年内收益领先方向为<strong>{leaders.return?.name ?? '—'}</strong>，收益中位数 {pct(leaders.return?.navMedian)}；资金净流入领先方向为<strong>{leaders.inflow?.name ?? '—'}</strong>，合计 {scale(leaders.inflow?.scaleNetIncrease)}。</p>
      <p>回撤压力最大的分类为<strong>{leaders.risk?.name ?? '—'}</strong>，最大回撤中位数 {pct(leaders.risk?.drawdownMedian)}。市场更接近结构性分化，而非所有基金同步上涨。</p>
    </section>

    <section className="forecast-baseline" aria-label="基准判断动态信号">
      <div className="forecast-baseline__headline"><span>基准判断（动态信号）</span><strong>{baseline.regime}</strong></div>
      <div className="forecast-baseline__body">
        <p><strong>当前判断：</strong>{baseline.interpretation}</p>
        <div className="baseline-signals">
          <button type="button" onClick={() => openForecastRow(leaders.return)}><span>收益信号</span><strong>{leaders.return?.name ?? '待补充'}</strong><small>收益中位数 {pct(leaders.return?.navMedian)} · 正收益分类占比 {pct(baseline.positiveReturnBreadth)}</small></button>
          <button type="button" onClick={() => openForecastRow(leaders.inflow)}><span>资金信号</span><strong>{leaders.inflow?.name ?? '待补充'}</strong><small>分类净增额 {scale(leaders.inflow?.scaleNetIncrease)} · 稳健资产合计 {scale(baseline.defensiveFlow)}</small></button>
          <button type="button" onClick={() => openForecastRow(leaders.risk)}><span>风险信号</span><strong>{leaders.risk?.name ?? '待补充'}</strong><small>回撤中位数 {pct(leaders.risk?.drawdownMedian)} · 类别收益差 {pct(baseline.dispersion)}</small></button>
        </div>
        <p><strong>产品经理含义：</strong>{baseline.action}</p>
        <p className="baseline-invalidation"><strong>判断切换条件：</strong>{baseline.invalidation}</p>
        <small>收益、资金流、回撤与分类广度每日重算；情景区间仅作分类研究参照，不代表单只基金收益承诺。</small>
      </div>
    </section>

    <section className="forecast-table" aria-label="分类行情预测">
      <div className="forecast-row forecast-row--head"><span>基金类型</span><span>当前判断</span><span>情景区间</span><span>年内收益中位数</span><span>规模净增额</span><span>最大回撤中位数</span></div>
      {forecast.rows.map((row) => <button type="button" key={row.id} className={`forecast-row ${selected?.id === row.id ? 'selected' : ''}`} onClick={() => setSelectedId(row.id)}>
        <strong>{row.name}</strong><span>{row.judgement}</span><span>{row.range}</span><span className={(row.navMedian ?? 0) >= 0 ? 'positive' : 'negative'}>{pct(row.navMedian)}<small>{row.returnSampleCount}只同区间样本</small></span><span className={row.scaleNetIncrease >= 0 ? 'positive' : 'negative'}>{scale(row.scaleNetIncrease)}</span><span className="negative">{pct(row.drawdownMedian)}</span>
      </button>)}
    </section>

    {selected ? <section className="forecast-detail">
      <div className="workspace-heading"><div><h2>{selected.name}·构成产品</h2><p>{selected.funds.length.toLocaleString('zh-CN')} 只产品；表格展示排序前 30。</p></div><div className="forecast-actions"><select aria-label="预测构成基金排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="nav">年内收益</option><option value="scale">规模净增额</option><option value="drawdown">最大回撤</option></select><button type="button" onClick={() => onOpenFundLibrary({ query: selected.name.split('/')[0], contextLabel: selected.name })}>进入公募基金简报</button></div></div>
      <div className="forecast-funds"><div><span>基金产品</span><span>代码</span><span>类型</span><span>年内收益</span><span>规模净增额</span><span>最大回撤</span></div>{funds.map((fund) => <button type="button" key={fund.productId} onClick={() => onOpenFundLibrary({ query: fund.representativeCode, contextLabel: fund.productName })}><strong>{fund.productName}</strong><span>{fund.representativeCode}</span><span>{fund.type}</span><span>{pct(fund.navGrowthPercent)}</span><span>{scale(fund.scaleNetIncreaseYi)}</span><span>{pct(fund.maxDrawdownPercent)}</span></button>)}</div>
    </section> : null}
  </main>
}
