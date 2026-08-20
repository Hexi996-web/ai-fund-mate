import { useState } from 'react'
import FundApp from '../../App.jsx'
import './issuanceInsight.css'

const WINDOWS = [
  { id: 'quarter', label: '近三个月', description: '仅展示数据日期向前推三个月内成立的基金产品' },
  { id: 'ytd', label: '本年至今', description: '仅展示本年1月1日至数据日期成立的基金产品' },
]

export function IssuanceInsight() {
  const [windowId, setWindowId] = useState('quarter')
  const active = WINDOWS.find((window) => window.id === windowId)

  return <section className="issuance-database-shell">
    <header className="issuance-database-heading">
      <div><h1>发行洞察</h1><p>聚焦本年新成立公募基金，产品合并、分类、指标和排序口径与市场分析保持一致。</p></div>
    </header>
    <div className="issuance-window-tabs" role="tablist" aria-label="发行基金成立时间窗口">
      {WINDOWS.map((window) => <button key={window.id} type="button" role="tab" aria-selected={windowId === window.id} className={windowId === window.id ? 'active' : ''} onClick={() => setWindowId(window.id)}><strong>{window.label}</strong><span>{window.description}</span></button>)}
    </div>
    <div role="tabpanel" aria-label={`${active.label}成立基金数据库`}>
      <FundApp key={windowId} establishedWindow={windowId} />
    </div>
  </section>
}
