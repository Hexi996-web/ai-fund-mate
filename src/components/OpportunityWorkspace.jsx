import { useEffect, useMemo, useState } from 'react'
import { fetchThemeWorkspace } from '../data/themeData.js'
import { fetchSignalSnapshot } from '../features/signal-radar/signalApi.js'
import { ThemeWorkspace } from './ThemeWorkspace.jsx'

const heatLabel = (score) => score >= 65 ? '高热' : score >= 55 ? '升温' : score >= 45 ? '中性' : '偏冷'
const actionLabel = (item) => {
  const supply = item.relatedFunds?.all?.length ?? 0
  if (item.score >= 60 && item.confidence.score >= 65 && supply < 200) return '进入立项验证'
  if (item.score >= 55 && supply >= 200) return '寻找细分差异化'
  if (item.confidence.score < 60) return '补证据，不建议启动'
  return '保持观察'
}

export function OpportunityWorkspace({ onOpenFundLibrary }) {
  const [themes, setThemes] = useState([])
  const [signals, setSignals] = useState([])
  const [selectedTheme, setSelectedTheme] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([
      fetchThemeWorkspace((url) => fetch(url, { signal: controller.signal })),
      fetchSignalSnapshot((url, options) => fetch(url, { ...options, signal: controller.signal })),
    ]).then(([themeResult, signalResult]) => {
      if (themeResult.status === 'fulfilled') setThemes(themeResult.value)
      if (signalResult.status === 'fulfilled') setSignals(signalResult.value.snapshot?.signals ?? [])
    })
    return () => controller.abort()
  }, [])
  const decisionSignals = useMemo(() => signals.filter((signal) => signal.category === 'customer' && signal.customerDemandScore >= 0.8), [signals])

  return <main className="workspace-main opportunity-workspace">
    <header className="opportunity-heading"><div><span>从市场信号到产品动作</span><h1>板块热度与发行机会矩阵</h1><p>原始资讯只作为证据，机会由热度、置信度、产品供给与客户需求共同决定。</p></div><div className="decision-signal-state"><strong>{decisionSignals.length}</strong><span>条决策级信号</span><small>{signals.length - decisionSignals.length} 条杂讯已降噪</small></div></header>
    <section className="opportunity-matrix" aria-label="发行机会矩阵">
      <div className="opportunity-matrix__head"><span>板块</span><span>热度</span><span>置信度</span><span>产品供给</span><span>建议动作</span></div>
      {themes.map((item) => <button type="button" key={item.theme} onClick={() => setSelectedTheme(item.theme)}>
        <strong>{item.name}</strong><span><i style={{ width: `${item.score}%` }} />{heatLabel(item.score)} {item.score}</span><span>{item.confidence.score}</span><span>{(item.relatedFunds?.all?.length ?? 0).toLocaleString('zh-CN')} 只</span><em>{actionLabel(item)}</em>
      </button>)}
    </section>
    <div className="opportunity-rule"><strong>决策规则</strong><span>热度高但供给拥挤：寻找细分空白；热度高且供给低：优先立项；置信度低：先补数据，不把新闻当结论。</span></div>
    <ThemeWorkspace onOpenFundLibrary={onOpenFundLibrary} selectedTheme={selectedTheme} compactHeading />
  </main>
}
