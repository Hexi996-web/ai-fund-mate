import { useState } from 'react'
import { ANALYSIS_SETTINGS_EVENT, ANALYSIS_SETTINGS_KEY, getSessionAnalysisSettings } from '../data/dynamicAnalysis.js'

const PROVIDERS = {
  zhipu: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2' },
  kimi: { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: '' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: '' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '' },
}

export function AnalysisModelSettings({ compact = false }) {
  const saved = getSessionAnalysisSettings()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState(saved.provider || 'zhipu')
  const [model, setModel] = useState(saved.model || PROVIDERS.zhipu.model)
  const [apiKey, setApiKey] = useState(saved.apiKey || '')
  const selectProvider = (value) => { setProvider(value); setModel(PROVIDERS[value].model) }
  const save = (event) => {
    event.preventDefault()
    const preset = PROVIDERS[provider]
    sessionStorage.setItem(ANALYSIS_SETTINGS_KEY, JSON.stringify({ provider, baseUrl: preset.baseUrl, model: model.trim(), apiKey: apiKey.trim() }))
    window.dispatchEvent(new Event(ANALYSIS_SETTINGS_EVENT)); setOpen(false)
  }
  const clear = () => { sessionStorage.removeItem(ANALYSIS_SETTINGS_KEY); setApiKey(''); window.dispatchEvent(new Event(ANALYSIS_SETTINGS_EVENT)); setOpen(false) }
  return <div className="analysis-settings-shell">
    <button type="button" className="analysis-settings-trigger" aria-label="模型设置" title="模型设置" onClick={() => setOpen((value) => !value)}>{compact ? '⚙' : '模型设置'}</button>
    {open ? <form className="analysis-settings-popover" onSubmit={save}>
      <header><div><small>动态报告设置</small><strong>接入智谱等兼容模型</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <label>服务商<select value={provider} onChange={(event) => selectProvider(event.target.value)}>{Object.entries(PROVIDERS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
      <label>API 地址<input value={PROVIDERS[provider].baseUrl} readOnly /></label>
      <label>模型名称<input required value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 glm-5.2" /></label>
      <label>API Key<input required type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅保存在当前浏览器会话" /></label>
      <p>密钥不会写入数据库、GitHub或网页代码；关闭浏览器后自动清除。生成的报告正文会进入数据库缓存。</p>
      <div><button type="button" onClick={clear}>清除配置</button><button type="submit" className="primary">保存并重新分析</button></div>
    </form> : null}
  </div>
}
