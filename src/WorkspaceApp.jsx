import { useCallback, useState } from 'react'
import FundApp from './App.jsx'
import { OpportunityWorkspace } from './components/OpportunityWorkspace.jsx'
import { MarketDecisionBar } from './components/MarketDecisionBar.jsx'
import { IssuanceInsight } from './features/issuance-insight/IssuanceInsight.jsx'
import './workspace.css'

const WORKSPACES = [
  { id: 'issuance', label: '发行洞察' },
  { id: 'opportunities', label: '板块机会' },
  { id: 'funds', label: '基金产品库' },
]

export default function WorkspaceApp() {
  const [workspace, setWorkspace] = useState('issuance')
  const [fundContext, setFundContext] = useState({ query: '', contextLabel: '' })
  const openFundLibrary = (context = {}) => {
    setFundContext({ query: context.query ?? '', contextLabel: context.contextLabel ?? '' })
    setWorkspace('funds')
  }
  const rememberFundQuery = useCallback((query) => setFundContext((current) => ({ ...current, query })), [])

  return <>
    <nav className="workspace-nav" aria-label="产品工作区">
      <div className="workspace-nav__inner">
        <strong>AI Fund Mate</strong>
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
    <MarketDecisionBar onOpenIssuance={() => setWorkspace('issuance')} />
    {workspace === 'issuance' ? <IssuanceInsight /> : null}
    {workspace === 'opportunities' ? <OpportunityWorkspace onOpenFundLibrary={openFundLibrary} /> : null}
    {workspace === 'funds' ? <FundApp initialQuery={fundContext.query} onQueryChange={rememberFundQuery} /> : null}
  </>
}
