import { useEffect, useMemo, useState } from 'react'
import { buildHotSectors } from '../data/marketSectors.js'

const pct = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`

export function OpportunityWorkspace({ onOpenFundLibrary }) {
  const [sectors, setSectors] = useState([])
  const [selected, setSelected] = useState(null)
  const [fundSort, setFundSort] = useState('dailyDesc')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/fund_products.json', { signal: controller.signal }).then((response) => response.json()).then((data) => setSectors(buildHotSectors(data))).catch(() => {})
    return () => controller.abort()
  }, [])
  const sector = useMemo(() => sectors.find((item) => item.name === selected) ?? sectors[0], [sectors, selected])
  const sectorFunds = useMemo(() => [...(sector?.funds ?? [])].sort((left, right) => {
    if (fundSort === 'default') return 0
    const leftValue = Number.isFinite(left.dailyChangePercent) ? left.dailyChangePercent : null
    const rightValue = Number.isFinite(right.dailyChangePercent) ? right.dailyChangePercent : null
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    return (fundSort === 'dailyAsc' ? leftValue - rightValue : rightValue - leftValue)
      || left.productName.localeCompare(right.productName, 'zh-CN')
  }), [fundSort, sector])

  return <main className="workspace-main opportunity-workspace">
    <header className="opportunity-heading"><div><span>全市场产品净值扫描</span><h1>板块热度与发行机会</h1><p>每日从候选板块池自动选出热度前 8，板块会随市场表现进出，不再固定为五个主题。</p></div></header>
    <section className="heat-method"><strong>热度如何计算</strong><span>热度 = 50 + 板块基金当日平均涨跌幅 × 12 +（上涨基金占比 - 50%）× 0.45，结果限定在 0–100。至少 5 只有效样本才入榜；按产品去重，不重复计算 A/C 份额。</span></section>
    <section className="opportunity-matrix" aria-label="动态板块热度榜">
      <div className="opportunity-matrix__head"><span>板块</span><span>热度</span><span>当日平均涨跌</span><span>上涨宽度</span><span>产品供给</span></div>
      {sectors.map((item) => <button className={sector?.name === item.name ? 'selected' : ''} type="button" key={item.name} onClick={() => setSelected(item.name)}>
        <strong>{item.name}</strong><span><i style={{ width: `${item.heat}%` }} />{item.heat.toFixed(1)}</span><span className={item.avgReturn >= 0 ? 'positive' : 'negative'}>{pct(item.avgReturn)}</span><span>{item.upBreadth.toFixed(1)}%</span><span>{item.funds.length.toLocaleString('zh-CN')} 只 <u>查看明细</u></span>
      </button>)}
    </section>
    {sector ? <section className="sector-funds"><div className="workspace-heading"><div><h2>{sector.name}·全部构成基金</h2><p>共 {sector.funds.length} 只产品，当日有效净值样本 {sector.observed} 只。</p></div><div className="sector-fund-actions"><select aria-label="板块基金排序" value={fundSort} onChange={(event) => setFundSort(event.target.value)}><option value="dailyDesc">当日涨跌：高到低</option><option value="dailyAsc">当日涨跌：低到高</option><option value="default">默认顺序</option></select><button type="button" onClick={() => onOpenFundLibrary({ query: sector.name, contextLabel: sector.name })}>进入产品库</button></div></div>
      <div className="sector-fund-table"><div className="sector-fund-table__head"><span>基金产品</span><span>代表代码</span><span>类型</span><span>当日涨跌</span><span>申购状态</span></div>{sectorFunds.map((fund) => <div key={fund.productId}><strong>{fund.productName}</strong><span>{fund.representativeCode}</span><span>{fund.type}</span><span className={(fund.dailyChangePercent ?? 0) >= 0 ? 'positive' : 'negative'}>{Number.isFinite(fund.dailyChangePercent) ? pct(fund.dailyChangePercent) : '—'}</span><span>{fund.purchaseStatus}</span></div>)}</div>
    </section> : null}
  </main>
}
