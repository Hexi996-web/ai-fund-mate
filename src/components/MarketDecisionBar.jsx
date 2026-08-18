import { useEffect, useState } from 'react'
import { fetchIssuanceInsights } from '../features/issuance-insight/issuanceData.js'

const format = (value) => Number(value ?? 0).toLocaleString('zh-CN')

export function MarketDecisionBar({ onOpenIssuance }) {
  const [payload, setPayload] = useState(null)
  const [riskCount, setRiskCount] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    fetchIssuanceInsights(fetch, { signal: controller.signal }).then(setPayload).catch(() => {})
    fetch('/funds_excluded.json', { signal: controller.signal }).then((response) => response.json()).then((data) => setRiskCount(data.total)).catch(() => {})
    return () => controller.abort()
  }, [])

  if (!payload) return null
  const summary = payload.summary
  const upcoming = payload.offerings?.upcoming?.length ?? 0

  return <aside className="market-decision-bar" aria-label="全局发行市场信息">
    <div className="market-decision-bar__label"><span>市场决策摘要</span><strong>{payload.dataDate}</strong></div>
    <div className="market-decision-item"><b>发行拥挤度</b><span>近三月成立 {format(summary.quarterEstablished)} 只，年内 {format(summary.ytdEstablished)} 只</span></div>
    <div className="market-decision-item"><b>渠道窗口</b><span>{format(summary.todayOffering)} 只认购中，{format(summary.currentSuspended)} 只暂停申购</span></div>
    <div className="market-decision-item"><b>待发行预告</b><span>{format(upcoming)} 只已披露将发行产品，可提前评估同类拥挤</span></div>
    <div className="market-decision-item market-decision-item--wide"><b>清盘 / 转型预警</b><span>{riskCount === null ? '加载中' : `${format(riskCount)} 只份额疑似终止或长期停更`}；转型公告数据待接入，不与已确认清盘混计。</span></div>
    <button type="button" onClick={onOpenIssuance}>查看发行明细</button>
  </aside>
}
