import { useCallback, useState } from 'react'
import FundApp from './App.jsx'
import { ThemeWorkspace } from './components/ThemeWorkspace.jsx'
import './workspace.css'

export default function WorkspaceApp() {
  const [workspace, setWorkspace] = useState('themes')
  const [fundContext, setFundContext] = useState({ query: '', contextLabel: '' })
  const openFundLibrary = (context = {}) => {
    setFundContext({ query: context.query ?? '', contextLabel: context.contextLabel ?? '' })
    setWorkspace('funds')
  }
  const rememberFundQuery = useCallback((query) => setFundContext((current) => ({ ...current, query })), [])
  return <>
    <nav className="workspace-nav" aria-label="产品工作区"><div className="workspace-nav__inner"><strong>AI Fund Mate</strong><div>
      <button type="button" className={workspace === 'themes' ? 'active' : ''} onClick={() => setWorkspace('themes')}>主题研判</button>
      <button type="button" className={workspace === 'funds' ? 'active' : ''} onClick={() => setWorkspace('funds')}>基金产品库</button>
    </div></div></nav>
    {workspace === 'themes' ? <main className="workspace-main"><ThemeWorkspace onOpenFundLibrary={openFundLibrary} /></main> : <FundApp initialQuery={fundContext.query} onQueryChange={rememberFundQuery} />}
  </>
}