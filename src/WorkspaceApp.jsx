import { useCallback, useState } from 'react'
import FundApp from './App.jsx'
import { MarketForecastWorkspace } from './components/MarketForecastWorkspace.jsx'
import { IssuanceInsight } from './features/issuance-insight/IssuanceInsight.jsx'
import { PreResearchPool } from './components/PreResearchPool.jsx'
import { AgentAssistant } from './components/AgentAssistant.jsx'
import './workspace.css'

const WORKSPACES = [
  { id: 'research', label: '预研产品池' },
  { id: 'funds', label: '市场分析' },
  { id: 'issuance', label: '发行洞察' },
  { id: 'forecast', label: '行情预测' },
]

export default function WorkspaceApp() {
  const [workspace, setWorkspace] = useState('research')
  const [fundContext, setFundContext] = useState({ query: '', contextLabel: '' })
  const openFundLibrary = (context = {}) => {
    setFundContext({ query: context.query ?? '', contextLabel: context.contextLabel ?? '' })
    setWorkspace('funds')
  }
  const rememberFundQuery = useCallback((query) => setFundContext((current) => ({ ...current, query })), [])

  return <>
    <nav className="workspace-nav" aria-label="产品工作区">
      <div className="workspace-nav__inner">
        <div>
          {WORKSPACES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={workspace === id ? 'active' : ''}
              aria-current={workspace === id ? 'page' : undefined}
              onClick={() => setWorkspace(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
    {workspace === 'issuance' ? <IssuanceInsight /> : null}
    {workspace === 'research' ? <PreResearchPool /> : null}
    {workspace === 'forecast' ? <MarketForecastWorkspace onOpenFundLibrary={openFundLibrary} /> : null}
    {workspace === 'funds' ? <FundApp initialQuery={fundContext.query} onQueryChange={rememberFundQuery} /> : null}
    <AgentAssistant workspace={WORKSPACES.find((item) => item.id === workspace)?.label || workspace} />
  </>
}
