import { useCallback, useState } from 'react'
import FundApp from '../App.jsx'
import '../features/issuance-insight/issuanceInsight.css'

const SCOPES = [
  { id: 'all', label: '全市场公募基金', description: '全部存续产品，观察市场结构、资金流与风险收益' },
  { id: 'quarter', label: '近三个月以来发行的基金', description: '仅观察数据日前三个月内成立的新产品' },
  { id: 'ytd', label: '本年以来发行的基金', description: '仅观察本年1月1日以来成立的新产品' },
]

export function PublicFundBrief({ initialQuery = '', agentCommand, onContextChange, onQueryChange }) {
  const [scopeId, setScopeId] = useState('all')
  const active = SCOPES.find((scope) => scope.id === scopeId)
  const establishedWindow = scopeId === 'all' ? null : scopeId
  const handleContextChange = useCallback((context) => {
    const scope = SCOPES.find((item) => item.id === scopeId)
    onContextChange?.({ ...context, briefScope: scope?.label })
  }, [onContextChange, scopeId])
  return <section className="issuance-database-shell public-fund-brief">
    <header className="issuance-database-heading">
      <div><h1>公募基金简报</h1><p>在统一口径下切换全市场与新发基金范围，查看市场结构、发行变化、风险提示和产品经理建议。</p></div>
    </header>
    <div className="issuance-window-tabs public-fund-scope-tabs" role="tablist" aria-label="公募基金简报数据范围">
      {SCOPES.map((scope) => <button key={scope.id} type="button" role="tab" aria-selected={scopeId === scope.id} className={scopeId === scope.id ? 'active' : ''} onClick={() => setScopeId(scope.id)}><strong>{scope.label}</strong><span>{scope.description}</span></button>)}
    </div>
    <div role="tabpanel" aria-label={active.label}>
      <FundApp key={scopeId} establishedWindow={establishedWindow} initialQuery={initialQuery} agentCommand={agentCommand} onQueryChange={onQueryChange} onContextChange={handleContextChange} />
    </div>
  </section>
}
