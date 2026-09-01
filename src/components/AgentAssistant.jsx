import { useEffect, useRef, useState } from 'react'
import { loadAgentBootstrap, sendAgentMessage } from '../data/agentClient.js'
import { AnalysisModelSettings } from './AnalysisModelSettings.jsx'

const STARTERS = ['解释当前产品窗口', '哪些方向值得继续预研？', '检查今天的数据是否完整']
const INITIAL = [{ role: 'assistant', content: '我是简报助手。可以结合公募基金简报、预研产品池与行情研判，解释结论、比较证据并定位数据。' }]
const WORKSPACE_SOURCES = {
  '预研产品池': [{ label: '注意力母池', href: '/attention_pool_evidence.json' }, { label: '三层验证', href: '/pre_research_evidence.json' }],
  '公募基金简报': [{ label: '基金产品快照', href: '/fund_products.json' }],
  '行情预测': [{ label: '基金产品快照', href: '/fund_products.json' }],
}

export function AgentAssistant({ workspace, pageContext, onAction }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(INITIAL)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dataStatus, setDataStatus] = useState(null)
  const [agentContext, setAgentContext] = useState(null)
  const [cloudConfig, setCloudConfig] = useState(null)
  const [bootstrapDone, setBootstrapDone] = useState(false)
  const endRef = useRef(null)
  const requestRef = useRef(null)

  useEffect(() => {
    if (!open || dataStatus) return undefined
    const controller = new AbortController()
    loadAgentBootstrap(controller.signal).then((bootstrap) => {
      setDataStatus(bootstrap.dataStatus)
      setAgentContext(bootstrap.workspaceContext)
      setCloudConfig(bootstrap.cloudConfig)
    }).catch(() => {}).finally(() => setBootstrapDone(true))
    return () => controller.abort()
  }, [open, dataStatus])
  useEffect(() => () => requestRef.current?.abort(), [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, busy])

  const submit = async (text = input) => {
    const content = text.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setError('')
    setBusy(true)
    const controller = new AbortController()
    requestRef.current = controller
    try {
      const result = await sendAgentMessage({
        messages: next,
        context: { workspace, dataStatus, workspaceData: agentContext?.workspaces?.[workspace] || null, crossWorkspaceData: agentContext?.workspaces || null, pageContext, sources: WORKSPACE_SOURCES[workspace] || [], purpose: '公募基金产品经理预研与产品规划' },
        signal: controller.signal,
      })
      const executed = (result.actions || []).filter((action) => onAction?.(action))
      const actionNote = executed.length ? `\n\n已执行页面操作：${executed.map((action) => action.label || action.name).join('、')}` : ''
      setMessages((current) => [...current, { role: 'assistant', content: `${result.content}${actionNote}`, sources: result.sources || WORKSPACE_SOURCES[workspace] || [] }])
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message)
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      setBusy(false)
    }
  }

  return <div className={`agent-shell ${open ? 'is-open' : ''}`}>
    <button type="button" className="agent-launcher" aria-expanded={open} aria-controls="agent-panel" onClick={() => setOpen((value) => !value)}>
      <span>简报助手</span><small>解释与追问</small>
    </button>
    {open ? <aside className="agent-panel" id="agent-panel" aria-label="公募基金简报助手">
      <header><div><small>AI FUND MATE</small><strong>简报助手</strong><span>{cloudConfig?.configured ? `${cloudConfig.model || '统一模型'} · ` : ''}当前：{workspace}</span></div><div><button type="button" aria-label="清空对话" onClick={() => { requestRef.current?.abort(); setMessages(INITIAL); setError('') }}>↺</button><AnalysisModelSettings compact/><button type="button" aria-label="关闭简报助手" onClick={() => { requestRef.current?.abort(); setOpen(false) }}>×</button></div></header>
      <div className="agent-context"><span>已携带工作区</span><b>{workspace}</b><span>数据日期</span><b>{dataStatus?.snapshotDate || (bootstrapDone ? '未获取' : '读取中')}</b><span>数据上下文</span><b>{agentContext?.workspaces?.[workspace] ? '已同步' : (bootstrapDone ? '未获取' : '读取中')}</b></div>
      <div className="agent-messages" aria-live="polite">{messages.map((message, index) => <article className={message.role} key={`${message.role}-${index}`}><small>{message.role === 'user' ? '你' : 'Agent'}</small><p>{message.content}</p>{message.sources?.length ? <div className="agent-sources" aria-label="回答依据">{message.sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.label} · {dataStatus?.snapshotDate || '最新'}</a>)}</div> : null}</article>)}{busy ? <article className="assistant"><small>Agent</small><p>正在分析…</p></article> : null}<div ref={endRef} /></div>
      {messages.length === 1 ? <div className="agent-starters">{STARTERS.map((starter) => <button type="button" disabled={!bootstrapDone} onClick={() => submit(starter)} key={starter}>{starter}</button>)}</div> : null}
      {error ? <p className="agent-error" role="alert">{error}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); submit() }}><textarea rows="2" value={input} onChange={(event) => setInput(event.target.value)} placeholder="询问产品方向、趋势或数据依据…" /><button type="submit" disabled={!bootstrapDone || busy || !input.trim()}>发送</button></form>
      <footer>与动态报告共用本助手内的AI模型设置；仅辅助产品研究，不构成投资建议。</footer>
    </aside> : null}
  </div>
}
