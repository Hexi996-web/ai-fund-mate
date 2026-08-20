import { useEffect, useMemo, useState } from 'react'
import { buildMarketForecast } from '../data/marketForecast.js'
import { DATA_STATUS_POLL_MS, fetchDataStatus } from '../data/dataStatus.js'

const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'
const scale = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)} 亿元` : '—'

export function MarketForecastWorkspace({ onOpenFundLibrary }) {
  const [forecast, setForecast] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState('tech')
  const [sort, setSort] = useState('nav')
  const [loadedUpdateTime, setLoadedUpdateTime] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    setLoadError('')
    fetch('/fund_products.json', { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`行情预测数据请求失败（${response.status}）`)
        return response.json()
      })
      .then((payload) => {
        if (!Array.isArray(payload?.products) || payload.products.length === 0) throw new Error('行情预测数据为空')
        setForecast(buildMarketForecast(payload))
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
  const funds = useMemo(() => [...(selected?.funds ?? [])].sort((left, right) => {
    const field = sort === 'scale' ? 'scaleNetIncreaseYi' : sort === 'drawdown' ? 'maxDrawdownPercent' : 'navGrowthPercent'
    const a = Number.isFinite(left[field]) ? left[field] : -Infinity
    const b = Number.isFinite(right[field]) ? right[field] : -Infinity
    return b - a
  }).slice(0, 30), [selected, sort])

  if (!forecast && loadError) return <main className="workspace-main forecast-workspace"><section className="empty-state" role="alert"><h2>行情预测加载失败</h2><p>{loadError}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button></section></main>
  if (!forecast) return <main className="workspace-main forecast-workspace"><p>正在生成每日行情预测…</p></main>
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
      <span>每日自动更新</span>
    </header>

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
        <strong>{row.name}</strong><span>{row.judgement}</span><span>{row.range}</span><span className={(row.navMedian ?? 0) >= 0 ? 'positive' : 'negative'}>{pct(row.navMedian)}</span><span className={row.scaleNetIncrease >= 0 ? 'positive' : 'negative'}>{scale(row.scaleNetIncrease)}</span><span className="negative">{pct(row.drawdownMedian)}</span>
      </button>)}
    </section>

    <section className="forecast-calibration">
      <h2>宏观与行业校准</h2>
      <div><article><h3>经济</h3><strong>上半年 GDP 同比 +4.7%</strong><p>一季度 +5.0%、二季度 +4.3%，总量保持增长但动能有所放缓。</p><a href="https://www.stats.gov.cn/sj/xwfbh/fbhwd/202607/t20260715_1964121.html" target="_blank" rel="noreferrer">国家统计局</a></article><article><h3>物价</h3><strong>PPI 环境改善</strong><p>工业品价格改善有利于周期盈利，同时约束长久期债券单边行情。</p><a href="https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260715_1964134.html" target="_blank" rel="noreferrer">国家统计局</a></article><article><h3>公募资金</h3><strong>低风险资产仍占主导</strong><p>债券与货币基金体量仍高，市场呈现权益进攻与固收防守并存。</p><a href="https://www.amac.org.cn/sjtj/datastatistics/fundindustrydata/" target="_blank" rel="noreferrer">基金业协会</a></article></div>
    </section>

    <section className="forecast-watch"><div><h2>主要风险</h2><ul><li>高收益方向可能伴随更深阶段性回撤。</li><li>主题交易拥挤会放大净值波动与赎回压力。</li><li>黄金、资源及海外资产不能按历史收益线性外推。</li></ul></div><div><h2>需要持续验证的指标</h2><ul><li>领先板块的规模净增额是否继续为正。</li><li>收益上涨是否伴随回撤中位数持续恶化。</li><li>货币与债券基金资金是否向宽基和权益产品迁移。</li></ul></div></section>

    {selected ? <section className="forecast-detail">
      <div className="workspace-heading"><div><h2>{selected.name}·构成产品</h2><p>{selected.funds.length.toLocaleString('zh-CN')} 只产品；表格展示排序前 30。</p></div><div className="forecast-actions"><select aria-label="预测构成基金排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="nav">年内收益</option><option value="scale">规模净增额</option><option value="drawdown">最大回撤</option></select><button type="button" onClick={() => onOpenFundLibrary({ query: selected.name.split('/')[0], contextLabel: selected.name })}>进入市场分析</button></div></div>
      <div className="forecast-funds"><div><span>基金产品</span><span>代码</span><span>类型</span><span>年内收益</span><span>规模净增额</span><span>最大回撤</span></div>{funds.map((fund) => <button type="button" key={fund.productId} onClick={() => onOpenFundLibrary({ query: fund.representativeCode, contextLabel: fund.productName })}><strong>{fund.productName}</strong><span>{fund.representativeCode}</span><span>{fund.type}</span><span>{pct(fund.navGrowthPercent)}</span><span>{scale(fund.scaleNetIncreaseYi)}</span><span>{pct(fund.maxDrawdownPercent)}</span></button>)}</div>
    </section> : null}
  </main>
}
