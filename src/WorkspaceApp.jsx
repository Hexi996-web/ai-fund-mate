import { useCallback, useState } from 'react'
import { MarketForecastWorkspace } from './components/MarketForecastWorkspace.jsx'
import { PublicFundBrief } from './components/PublicFundBrief.jsx'
import { PreResearchPool } from './components/PreResearchPool.jsx'
import { AgentAssistant } from './components/AgentAssistant.jsx'
import './workspace.css'

const WORKSPACES = [
  { id: 'research', label: '预研产品池' },
  { id: 'funds', label: '公募基金简报' },
  { id: 'forecast', label: '行情预测' },
]

export default function WorkspaceApp() {
  const [workspace, setWorkspace] = useState('research')
  const [fundContext, setFundContext] = useState({ query: '', contextLabel: '' })
  const [pageContext, setPageContext] = useState({})
  const [agentCommand, setAgentCommand] = useState(null)
  const openFundLibrary = (context = {}) => {
    setFundContext({ query: context.query ?? '', contextLabel: context.contextLabel ?? '' })
    setWorkspace('funds')
  }
  const rememberFundQuery = useCallback((query) => setFundContext((current) => ({ ...current, query })), [])
  const updatePageContext = useCallback((next) => setPageContext(next || {}), [])
  const handleAgentAction = useCallback((action) => {
    const type = action?.name
    const args = action?.arguments || {}
    const workspaceMap = { research: 'research', funds: 'funds', issuance: 'funds', forecast: 'forecast', '预研产品池': 'research', '市场分析': 'funds', '发行洞察': 'funds', '公募基金简报': 'funds', '行情预测': 'forecast' }
    if (type === 'switch_workspace' && workspaceMap[args.workspace]) setWorkspace(workspaceMap[args.workspace])
    else if (type === 'focus_research_theme') { setWorkspace('research'); setAgentCommand({ id: Date.now(), type: 'focus-theme', ...args }) }
    else if (type === 'set_fund_filters') { setWorkspace('funds'); setAgentCommand({ id: Date.now(), type: 'fund-filters', ...args }) }
    else if (type === 'focus_forecast_category') { setWorkspace('forecast'); setAgentCommand({ id: Date.now(), type: 'forecast-category', ...args }) }
    else return false
    return true
  }, [])

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
    {workspace === 'research' ? <PreResearchPool agentCommand={agentCommand} onContextChange={updatePageContext} /> : null}
    {workspace === 'forecast' ? <MarketForecastWorkspace agentCommand={agentCommand} onContextChange={updatePageContext} onOpenFundLibrary={openFundLibrary} /> : null}
    {workspace === 'funds' ? <PublicFundBrief agentCommand={agentCommand} initialQuery={fundContext.query} onContextChange={updatePageContext} onQueryChange={rememberFundQuery} /> : null}
    <AgentAssistant workspace={WORKSPACES.find((item) => item.id === workspace)?.label || workspace} pageContext={pageContext} onAction={handleAgentAction} />
  </>
}
