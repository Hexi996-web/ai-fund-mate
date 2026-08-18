import { useEffect, useMemo, useState } from 'react'
import { fetchIssuanceInsights } from '../features/issuance-insight/issuanceData.js'

const format = (value) => Number(value ?? 0).toLocaleString('zh-CN')

export function MarketDecisionBar({ onOpenIssuance }) {
  const [payload, setPayload] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    fetchIssuanceInsights(fetch, { signal: controller.signal }).then(setPayload).catch(() => {})
    return () => controller.abort()
  }, [])

  const observation = useMemo(() => {
    const funds = payload?.rankings?.quarter ?? []
    const comparable = funds.filter((fund) => fund.raisedSharesYi > 0 && fund.latestScaleYi > 0)
    const expanded = comparable.filter((fund) => fund.latestScaleYi >= fund.raisedSharesYi * 1.1)
    const performanceLed = expanded.filter((fund) => fund.returnSinceInceptionPercent > 0)
    return { comparable: comparable.length, expanded: expanded.length, performanceLed: performanceLed.length }
  }, [payload])

  if (!payload) return null
  const summary = payload.summary
  const expansionText = observation.expanded
    ? `${observation.expanded} 只可比份额规模较募集期扩大，其中 ${observation.performanceLed} 只成立来收益为正`
    : '当前可比规模样本不足，暂不归因'

  return <aside className="market-decision-bar" aria-label="全局发行市场信息">
    <div className="market-decision-bar__label"><span>市场决策摘要</span><strong>{payload.dataDate}</strong></div>
    <div className="market-decision-item"><b>发行拥挤度</b><span>近三月成立 {format(summary.quarterEstablished)} 只，年内 {format(summary.ytdEstablished)} 只</span></div>
    <div className="market-decision-item"><b>渠道窗口</b><span>{format(summary.todayOffering)} 只认购中，{format(summary.currentSuspended)} 只暂停申购</span></div>
    <div className="market-decision-item market-decision-item--wide"><b>规模变化线索</b><span>{expansionText}。可能由业绩、渠道持营和净申购共同驱动，需进一步验证。</span></div>
    <button type="button" onClick={onOpenIssuance}>查看发行明细</button>
  </aside>
}
