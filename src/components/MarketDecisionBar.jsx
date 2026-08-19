import { useEffect, useState } from 'react'
import { fetchIssuanceInsights } from '../features/issuance-insight/issuanceData.js'

const format = (value) => Number(value ?? 0).toLocaleString('zh-CN')

export function MarketDecisionBar({ onOpenIssuance }) {
  const [payload, setPayload] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    fetchIssuanceInsights(fetch, { signal: controller.signal }).then(setPayload).catch(() => {})
    return () => controller.abort()
  }, [])

  if (!payload) return null
  const summary = payload.summary
  const future = payload.futureIssuance
  const exitRisk = payload.exitRisk

  return <aside className="market-decision-bar" aria-label="全局发行市场信息">
    <div className="market-decision-bar__label"><span>市场决策摘要</span><strong>{payload.dataDate}</strong></div>
    <div className="market-decision-item"><b>发行拥挤度</b><span>近三月成立 {format(summary.quarterEstablished)} 只，年内 {format(summary.ytdEstablished)} 只</span></div>
    <div className="market-decision-item"><b>渠道窗口</b><span>{format(future?.ongoingCount ?? summary.todayOffering)} 只产品认购中，{format(summary.currentSuspended)} 只产品暂停申购</span></div>
    <div className="market-decision-item"><b>待发行预告</b><span>{format(future?.upcomingCount ?? summary.upcomingOffering)} 只产品待发行；原始披露含 {format(summary.upcomingOffering)} 个份额</span></div>
    <div className="market-decision-item market-decision-item--wide"><b>今年异常退出跟踪</b><span>{exitRisk?.ytdAbnormalProducts > 0 ? `今年新增 ${format(exitRisk.ytdAbnormalProducts)} 只产品（确认终止 ${format(exitRisk.ytdConfirmedTerminated)}，疑似长期停更 ${format(exitRisk.ytdSuspectedTerminated)}）` : '当前暂无今年新增异常产品'}；跟踪前 {format(exitRisk?.baselineShareClasses)} 个份额仅作基线。</span></div>
    <button type="button" onClick={onOpenIssuance}>查看发行明细</button>
  </aside>
}
