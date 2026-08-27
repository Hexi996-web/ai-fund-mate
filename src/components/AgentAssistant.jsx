import { useEffect, useRef, useState } from 'react'
import { DEFAULT_LOCAL_ENDPOINT, sendAgentMessage } from '../data/agentClient.js'

const STARTERS = ['解释当前产品窗口', '哪些方向值得继续预研？', '检查今天的数据是否完整']
const INITIAL = [{ role: 'assistant', content: '我是产品经理Agent。可以结合当前工作区和公开数据快照，帮助解释产品方向、比较证据和发现待验证问题。' }]

export function AgentAssistant({ workspace }) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [provider, setProvider] = useState('cloud')
  const [endpoint, setEndpoint] = useState(DEFAULT_LOCAL_ENDPOINT)
  const [model, setModel] = useState('qwen3:8b')
  const [messages, setMessages] = useState(INITIAL)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dataStatus, setDataStatus] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    if (!open || dataStatus) return
    fetch('/data_status.json', { cache: 'no-store' }).then((response) => response.json()).then(setDataStatus).catch(() => {})
  }, [open, dataStatus])
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
    try {
      const result = await sendAgentMessage({
        provider,
        endpoint,
        model,
        messages: next,
        context: { workspace, dataStatus, purpose: '公募基金产品经理预研与产品规划' },
      })
      setMessages((current) => [...current, { role: 'assistant', content: result.content }])
    } catch (requestError) {
      setError(provider === 'local' ? `${requestError.message}。请确认本地模型已启动并允许当前网页跨域访问。` : requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className={`agent-shell ${open ? 'is-open' : ''}`}>
    <button type="button" className="agent-launcher" aria-expanded={open} aria-controls="agent-panel" onClick={() => setOpen((value) => !value)}>
      <span>Agent</span><small>产品经理助手</small>
    </button>
    {open ? <aside className="agent-panel" id="agent-panel" aria-label="产品经理Agent">
      <header><div><small>AI FUND MATE</small><strong>产品经理Agent</strong><span>{provider === 'local' ? '本地模型' : '云端API'} · 当前：{workspace}</span></div><div><button type="button" aria-label="模型设置" onClick={() => setSettingsOpen((value) => !value)}>⚙</button><button type="button" aria-label="关闭Agent" onClick={() => setOpen(false)}>×</button></div></header>
      {settingsOpen ? <section className="agent-settings" aria-label="模型设置">
        <label>模型来源<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="cloud">云端统一接口</option><option value="local">本地Ollama</option></select></label>
        {provider === 'local' ? <><label>本地接口<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label><label>模型名称<input value={model} onChange={(event) => setModel(event.target.value)} /></label><p>本地模式不会上传对话，但浏览器必须能访问该地址，并由Ollama允许本站来源。</p></> : <p>云端密钥只保存在Vercel服务端环境变量中，不会发送到浏览器。</p>}
      </section> : null}
      <div className="agent-context"><span>已携带工作区</span><b>{workspace}</b><span>数据日期</span><b>{dataStatus?.snapshotDate || '读取中'}</b></div>
      <div className="agent-messages" aria-live="polite">{messages.map((message, index) => <article className={message.role} key={`${message.role}-${index}`}><small>{message.role === 'user' ? '你' : 'Agent'}</small><p>{message.content}</p></article>)}{busy ? <article className="assistant"><small>Agent</small><p>正在分析…</p></article> : null}<div ref={endRef} /></div>
      {messages.length === 1 ? <div className="agent-starters">{STARTERS.map((starter) => <button type="button" onClick={() => submit(starter)} key={starter}>{starter}</button>)}</div> : null}
      {error ? <p className="agent-error" role="alert">{error}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); submit() }}><textarea rows="2" value={input} onChange={(event) => setInput(event.target.value)} placeholder="询问产品方向、趋势或数据依据…" /><button type="submit" disabled={busy || !input.trim()}>发送</button></form>
      <footer>仅辅助产品预研，不构成投资建议；Agent暂不执行数据修改或外部操作。</footer>
    </aside> : null}
  </div>
}
