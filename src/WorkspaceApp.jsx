import { useCallback, useState } from 'react'
import FundApp from './App.jsx'
import { ThemeWorkspace } from './components/ThemeWorkspace.jsx'
import { SignalRadar } from './features/signal-radar/SignalRadar.jsx'
import './workspace.css'

const WORKSPACES = [
  { id: 'signals', label: '信号雷达' },
  { id: 'themes', label: '主题研判' },
  { id: 'funds', label: '基金产品库' },
]

export default function WorkspaceApp() {
  const [workspace, setWorkspace] = useState('signals')
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
    {workspace === 'signals' ? <SignalRadar /> : null}
    {workspace === 'themes' ? <main className="workspace-main"><ThemeWorkspace onOpenFundLibrary={openFundLibrary} /></main> : null}
    {workspace === 'funds' ? <FundApp initialQuery={fundContext.query} onQueryChange={rememberFundQuery} /> : null}
  </>
}