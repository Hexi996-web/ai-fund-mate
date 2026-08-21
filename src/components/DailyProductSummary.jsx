import { useMemo, useState } from 'react'
import { FUND_CATEGORIES } from './FundControls.jsx'
import { ReportScope } from './ReportScope.jsx'
import { getFundCategories } from '../data/fundModel.js'

const valid = (value) => Number.isFinite(value)
const number = (value, digits = 2) => valid(value)
  ? Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '待披露'
const yi = (value) => valid(value) ? `${number(value)}亿元` : '待披露'
const percent = (value) => valid(value) ? `${number(value)}%` : '待积累'
const sum = (values) => values.filter(valid).reduce((total, value) => total + value, 0)
const median = (values) => {
  const sorted = values.filter(valid).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const share = (values, predicate) => values.length ? values.filter(predicate).length / values.length * 100 : null
const rank = (products, field, direction = 'desc') => products.filter((product) => valid(product[field]))
  .sort((left, right) => direction === 'desc' ? right[field] - left[field] : left[field] - right[field])

function LinkValue({ children, onClick }) {
  return <button className="summary-link" type="button" onClick={onClick}>{children}</button>
}

const categoryJudgement = (stats) => {
  if (!stats.comparableNetCount) return '规模基准覆盖不足，当前更适合观察产品供给，暂不判断资金方向。'
  if (stats.netTotal > 0 && stats.netBreadth >= 55 && (stats.navMedian ?? -Infinity) >= 0) return '资金与收益同步改善，具备继续跟踪价值。'
  if (stats.netTotal > 0 && stats.netBreadth < 55) return '增量集中于少数产品，不宜判断为类别全面扩张。'
  if (stats.netTotal <= 0 && (stats.navMedian ?? -Infinity) > 0) return '收益尚可但规模承接不足，需观察资金持续性。'
  if ((stats.navMedian ?? 0) < 0) return '资金与收益中枢承压，新增供给应保持谨慎。'
  return '整体处于分化阶段，产品选择重于类别配置。'
}

export function DailyProductSummary({ products, dataDate, establishedWindow, scopeStartDate, onSelectCategory, onSelectFund }) {
  const [expanded, setExpanded] = useState(false)
  const [flowDetails, setFlowDetails] = useState(true)
  const [chartMetric, setChartMetric] = useState('netTotal')
  const analysis = useMemo(() => {
    const globalRankings = {
      scaleNetIncreaseYi: rank(products, 'scaleNetIncreaseYi'),
      scaleGrowthPercent: rank(products, 'scaleGrowthPercent'),
      navGrowthPercent: rank(products, 'navGrowthPercent'),
      maxDrawdownPercent: rank(products, 'maxDrawdownPercent', 'asc'),
    }
    const globalRanks = Object.fromEntries(Object.entries(globalRankings).map(([field, ranked]) => [
      field, new Map(ranked.map((product, index) => [product.productId, index + 1])),
    ]))
    const categoryStats = FUND_CATEGORIES.slice(1).map((category) => {
      const categoryProducts = products.filter((product) => getFundCategories({ type: product.type, name: product.productName }).includes(category))
      const netValues = categoryProducts.map((product) => product.scaleNetIncreaseYi).filter(valid)
      const navValues = categoryProducts.map((product) => product.navGrowthPercent).filter(valid)
      const drawdowns = categoryProducts.map((product) => product.maxDrawdownPercent).filter(valid)
      const stats = {
        category,
        products: categoryProducts,
        count: categoryProducts.length,
        currentScale: sum(categoryProducts.map((product) => product.currentScaleYi)),
        netTotal: sum(netValues),
        comparableNetCount: netValues.length,
        netBreadth: share(netValues, (value) => value > 0),
        navMedian: median(navValues),
        navBreadth: share(navValues, (value) => value > 0),
        drawdownMedian: median(drawdowns),
        leaders: {
          scaleNetIncreaseYi: rank(categoryProducts, 'scaleNetIncreaseYi')[0],
          scaleGrowthPercent: rank(categoryProducts, 'scaleGrowthPercent')[0],
          navGrowthPercent: rank(categoryProducts, 'navGrowthPercent')[0],
          maxDrawdownPercent: rank(categoryProducts, 'maxDrawdownPercent', 'asc')[0],
        },
        netTopThree: rank(categoryProducts, 'scaleNetIncreaseYi').slice(0, 3),
      }
      return { ...stats, judgement: categoryJudgement(stats) }
    })
    const netProducts = rank(products, 'scaleNetIncreaseYi')
    const positiveNet = netProducts.filter((product) => product.scaleNetIncreaseYi > 0)
    const positiveNetTotal = sum(positiveNet.map((product) => product.scaleNetIncreaseYi))
    const netValues = products.map((product) => product.scaleNetIncreaseYi).filter(valid)
    const navValues = products.map((product) => product.navGrowthPercent).filter(valid)
    const drawdowns = products.map((product) => product.maxDrawdownPercent).filter(valid)
    return {
      categoryStats,
      globalRanks,
      categoriesByNet: [...categoryStats].sort((left, right) => right.netTotal - left.netTotal),
      netLeader: netProducts[0],
      topFivePositive: positiveNet.slice(0, 5),
      growthLeader: rank(products, 'scaleGrowthPercent')[0],
      navLeader: rank(products, 'navGrowthPercent')[0],
      deepestDrawdown: rank(products, 'maxDrawdownPercent', 'asc')[0],
      netTotal: sum(netValues),
      netBreadth: share(netValues, (value) => value > 0),
      topFivePositiveContribution: positiveNetTotal ? sum(positiveNet.slice(0, 5).map((product) => product.scaleNetIncreaseYi)) / positiveNetTotal * 100 : null,
      navMedian: median(navValues),
      navBreadth: share(navValues, (value) => value > 0),
      drawdownMedian: median(drawdowns),
      comparableNetCount: netValues.length,
      navSampleCount: navValues.length,
    }
  }, [products])

  const fundLink = (product) => product
    ? <LinkValue onClick={() => onSelectFund(product.productName)}>{product.productName}（{product.representativeCode}）</LinkValue>
    : '待数据积累'
  const categoryLink = (stats, suffix = '') => <LinkValue onClick={() => onSelectCategory(stats.category)}>{stats.category}基金{stats.count}只{suffix}</LinkValue>
  const metricLeader = (stats, field, label, formatter) => {
    const product = stats.leaders[field]
    if (!product) return <>{label}待数据积累</>
    return <>{label}{fundLink(product)}（全市场第{analysis.globalRanks[field].get(product.productId)}，{formatter(product[field])}）</>
  }
  const categorySummary = (stats) => {
    const topFunds = stats.netTopThree.filter((product) => product.scaleNetIncreaseYi > 0)
    const sameThemeRisk = stats.leaders.navGrowthPercent?.productId === stats.leaders.maxDrawdownPercent?.productId
    return <>{topFunds.length ? <>规模增量主要集中在{topFunds.map((product, index) => <span key={product.productId}>{index ? '、' : ''}{fundLink(product)}</span>)}</> : '规模增量暂未形成明确头部'}；{sameThemeRisk ? '收益与深度回撤集中于同一产品，高弹性特征突出。' : `${stats.judgement}`}</>
  }
  const topCategory = analysis.categoriesByNet[0]
  const secondCategory = analysis.categoriesByNet[1]
  const flowConcentrated = (analysis.topFivePositiveContribution ?? 0) >= 45 || (analysis.netBreadth ?? 100) < 50
  const returnBroad = (analysis.navBreadth ?? 0) >= 55 && (analysis.navMedian ?? 0) > 0
  const chartOptions = {
    netTotal: { label: '规模净增额', value: (stats) => stats.netTotal, format: yi },
    count: { label: '产品数量', value: (stats) => stats.count, format: (value) => `${number(value, 0)}只` },
    navBreadth: { label: '正收益占比', value: (stats) => stats.navBreadth, format: percent },
  }
  const activeChart = chartOptions[chartMetric]
  const chartValues = analysis.categoryStats.map(activeChart.value).filter(valid)
  const chartMaximum = Math.max(...chartValues.map(Math.abs), 1)
  const topFlowMaximum = Math.max(...analysis.topFivePositive.map((product) => product.scaleNetIncreaseYi), 1)
  const isIssuance = establishedWindow === 'quarter' || establishedWindow === 'ytd'
  const sampleLabel = establishedWindow === 'quarter'
    ? `近三个月成立基金（${scopeStartDate}—${dataDate || '待更新'}）`
    : establishedWindow === 'ytd'
      ? `本年至今成立基金（${scopeStartDate}—${dataDate || '待更新'}）`
      : '全部存续公募基金产品（成立日期不限）'
  const summaryTitle = isIssuance
    ? `${establishedWindow === 'quarter' ? '近三个月' : '本年至今'}发行摘要`
    : '全市场公募基金摘要'
  const cumulativeDescription = isIssuance
    ? `规模净增额、净值增长、最大回撤均从各产品成立日起累计至${dataDate || '当前数据日'}；“近三个月/本年至今”仅限定成立日期`
    : `规模净增额、净值增长、最大回撤统计至${dataDate || '当前数据日'}；存量产品从年初计算，本年新成立产品从成立日起计算`

  return <section className="daily-product-summary" aria-labelledby="daily-summary-title">
    <div className="daily-summary__header"><div><h2 id="daily-summary-title">{summaryTitle}</h2><p>统计截止：{dataDate || '待更新'}</p></div><span className="freshness-status"><i />数据已更新</span></div>
    <ReportScope items={[
      { term: '研究样本', description: sampleLabel },
      { term: '累计指标', description: cumulativeDescription },
      { term: '当日快照', description: `单位净值和当前规模采用截至${dataDate || '当前数据日'}的最近可得数据，并非仅指当日发生的增量` },
    ]} />

    <div className="summary-section">
      <h3>市场现状：</h3>
      <p className="category-counts">{analysis.categoryStats.map((stats, index) => <span key={stats.category}>{index ? '、' : ''}{categoryLink(stats)}</span>)}。</p>
      <p><strong>产品经理判断：</strong>{topCategory?.netTotal > 0 ? <>{categoryLink(topCategory)}以{yi(topCategory.netTotal)}的规模净增额居前{secondCategory ? <>，领先{secondCategory.category}基金{yi(topCategory.netTotal - secondCategory.netTotal)}</> : null}；但{percent(topCategory.netBreadth)}的区内产品实现规模正增长，说明资金流入{topCategory.netBreadth >= 55 ? '具备一定广度' : '仍偏头部集中'}。</> : <>九类视角暂未形成明确正向规模增量，市场处于存量再配置阶段。</>}</p>
      <p><strong>全市场结构：</strong>具备规模基准的产品共{analysis.comparableNetCount.toLocaleString('zh-CN')}只，规模净增额合计{yi(analysis.netTotal)}，正增长产品占{percent(analysis.netBreadth)}；<button className="summary-link" type="button" aria-expanded={flowDetails} aria-controls="market-flow-visuals" onClick={() => setFlowDetails((value) => !value)}>前五只净流入产品贡献正向增量的{percent(analysis.topFivePositiveContribution)}</button>。{flowConcentrated ? '增量集中度偏高，不能把头部吸金等同于全市场扩容。' : '增量分布相对均衡，资金扩散信号较为健康。'}</p>

      {flowDetails ? <div className="market-visuals" id="market-flow-visuals">
        <section className="market-chart" aria-labelledby="category-flow-title">
          <div className="market-chart__header">
            <div><h4 id="category-flow-title">九类基金对比</h4><span>点击类别联动下方数据库</span></div>
            <div className="chart-metric-switch" role="group" aria-label="九类基金对比指标">
              {Object.entries(chartOptions).map(([key, option]) => <button type="button" aria-pressed={chartMetric === key} key={key} onClick={() => setChartMetric(key)}>{option.label}</button>)}
            </div>
          </div>
          <div className="category-bars">
            {analysis.categoryStats.map((stats) => {
              const value = activeChart.value(stats)
              return <button className="category-bar" type="button" key={stats.category} onClick={() => onSelectCategory(stats.category)} aria-label={`${stats.category}基金，${activeChart.label}${activeChart.format(value)}`}>
                <span className="category-bar__label">{stats.category}</span>
                <span className="category-bar__track"><i data-direction={value < 0 ? 'negative' : 'positive'} style={{ width: `${Math.max(Math.abs(value) / chartMaximum * 100, 2)}%` }} /></span>
                <strong>{activeChart.format(value)}</strong>
              </button>
            })}
          </div>
        </section>

        <section className="market-chart top-flow-chart" aria-labelledby="top-flow-title">
          <div className="market-chart__header"><div><h4 id="top-flow-title">前五净流入产品</h4><span>合计贡献正向增量的{percent(analysis.topFivePositiveContribution)}</span></div></div>
          <ol>
            {analysis.topFivePositive.map((product) => <li key={product.productId}>
              <button type="button" onClick={() => onSelectFund(product.productName)}>
                <span className="top-flow-chart__name"><strong>{product.productName}</strong><small>{product.representativeCode}</small></span>
                <span className="top-flow-chart__track"><i style={{ width: `${product.scaleNetIncreaseYi / topFlowMaximum * 100}%` }} /></span>
                <b>{yi(product.scaleNetIncreaseYi)}</b>
              </button>
            </li>)}
          </ol>
        </section>
      </div> : null}
    </div>

    <div className="summary-section summary-analysis">
      <h3>市场分析：</h3>
      <p><strong>规模净增额：</strong>{fundLink(analysis.netLeader)}净增{yi(analysis.netLeader?.scaleNetIncreaseYi)}；{flowConcentrated ? '当前应优先围绕已有头部产品完善工具链，谨慎新增同质化产品。' : '资金并非只集中于少数头部，可继续观察细分赛道的新产品窗口。'}</p>
      <p><strong>净值增长：</strong>{analysis.navSampleCount.toLocaleString('zh-CN')}只有效样本的净值增长中位数为{percent(analysis.navMedian)}，正收益产品占{percent(analysis.navBreadth)}；{returnBroad ? '收益已从少数冠军向更广产品扩散。' : '赚钱效应仍偏结构性，冠军产品不代表多数持有人体验。'}领先产品为{fundLink(analysis.navLeader)}。</p>
      <p><strong>最大回撤：</strong>最大回撤中位数为{percent(analysis.drawdownMedian)}，尾部压力较深的是{fundLink(analysis.deepestDrawdown)}、回撤{percent(analysis.deepestDrawdown?.maxDrawdownPercent)}。{Math.abs(analysis.drawdownMedian ?? 0) > Math.max(analysis.navMedian ?? 0, 0) * 1.5 ? '当前回撤代价高于收益中枢，产品表达应降低短期收益外推。' : '整体风险收益尚可匹配，但仍需关注尾部主题产品。'}</p>
    </div>

    {expanded ? <div className="summary-section category-analysis">
      <h3>按基金类型分区解读：</h3>
      {analysis.categoryStats.map((stats) => <article className="category-brief" key={stats.category}>
        <h4>{categoryLink(stats)}</h4>
        <p className="category-brief__metrics">{metricLeader(stats, 'scaleNetIncreaseYi', '规模净增额区内领先的是', (value) => `净增${yi(value)}`)}；{metricLeader(stats, 'scaleGrowthPercent', '规模增长率区内领先的是', (value) => `增长${percent(value)}`)}；{metricLeader(stats, 'navGrowthPercent', '净值增长区内领先的是', (value) => `收益${percent(value)}`)}；{metricLeader(stats, 'maxDrawdownPercent', '最大回撤区内最靠前的是', (value) => `回撤${percent(value)}`)}。</p>
        <p className="category-brief__take">{categorySummary(stats)}</p>
      </article>)}
      <h3>结论：</h3>
      <p><strong>配置端：</strong>{topCategory?.netTotal > 0 ? `${topCategory.category}是当前资金承接主方向，但需结合${percent(topCategory.netBreadth)}的流入广度判断持续性。` : '暂无单一类别形成强资金承接，配置仍以分散和流动性管理为主。'}</p>
      <p><strong>产品端：</strong>{flowConcentrated ? '头部五只贡献度偏高，新发产品应强调差异化指数、期限或策略暴露，避免复制存量头部。' : '资金扩散较均衡，可从正增长广度较高且收益中枢为正的类别筛选新增供给。'}</p>
      <p><strong>销售端：</strong>{returnBroad ? '正收益覆盖较广，可从组合配置角度表达机会。' : '收益分化明显，应同时展示中位收益与回撤，不以单只冠军替代类别表现。'}</p>
      <p><strong>风控端：</strong>以{percent(analysis.drawdownMedian)}的回撤中位数作为当前产品风险锚，重点复核收益领先但回撤显著高于类别中位数的产品。</p>
    </div> : null}

    <button className="summary-expand" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起分区解读' : '展开九类基金分区解读与结论'}</button>
  </section>
}
