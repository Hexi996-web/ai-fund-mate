const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:11434/api/chat'
const LOCAL_TOOLS = [
  { type: 'function', function: { name: 'switch_workspace', description: '切换到工作板块', parameters: { type: 'object', properties: { workspace: { type: 'string' } }, required: ['workspace'] } } },
  { type: 'function', function: { name: 'focus_research_theme', description: '定位预研方向', parameters: { type: 'object', properties: { themeId: { type: 'string' }, themeName: { type: 'string' } } } } },
  { type: 'function', function: { name: 'set_fund_filters', description: '设置基金查询与排序', parameters: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' }, sortMode: { type: 'string' } } } } },
  { type: 'function', function: { name: 'focus_forecast_category', description: '定位行情分类', parameters: { type: 'object', properties: { categoryId: { type: 'string' }, categoryName: { type: 'string' } } } } },
]
const ACTION_LABELS = { switch_workspace: '切换工作板块', focus_research_theme: '定位预研方向', set_fund_filters: '设置基金筛选', focus_forecast_category: '定位行情分类' }

function cleanMessages(messages) {
  return messages.slice(-12).map(({ role, content }) => ({ role, content: String(content).slice(0, 6000) }))
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `模型请求失败（${response.status}）`)
  return payload
}

export async function loadAgentBootstrap(signal) {
  const [statusResult, contextResult, configResult] = await Promise.allSettled([
    fetch('/data_status.json', { cache: 'no-store', signal }).then(readJson),
    fetch('/agent_context.json', { cache: 'no-store', signal }).then(readJson),
    fetch('/api/agent/chat', { cache: 'no-store', signal }).then(readJson),
  ])
  return {
    dataStatus: statusResult.status === 'fulfilled' ? statusResult.value : null,
    workspaceContext: contextResult.status === 'fulfilled' ? contextResult.value : null,
    cloudConfig: configResult.status === 'fulfilled' ? configResult.value : { configured: false },
  }
}

export async function sendAgentMessage({ provider, endpoint, model, messages, context, signal }) {
  if (provider === 'local') {
    const target = endpoint || DEFAULT_LOCAL_ENDPOINT
    const request = { model: model || 'qwen3:8b', messages: cleanMessages(messages), stream: false, tools: LOCAL_TOOLS }
    let response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (response.status === 400) response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, tools: undefined }), signal })
    const payload = await readJson(response)
    const actions = (payload.message?.tool_calls || []).flatMap((call) => {
      const name = call.function?.name
      if (!ACTION_LABELS[name]) return []
      const args = call.function?.arguments
      try { return [{ name, label: ACTION_LABELS[name], arguments: typeof args === 'string' ? JSON.parse(args || '{}') : (args || {}) }] } catch { return [] }
    })
    return { content: payload.message?.content || payload.response || (actions.length ? '已根据你的要求定位页面内容。' : '本地模型未返回文本'), actions, provider: 'local', model: payload.model || model, sources: context?.sources || [] }
  }
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: cleanMessages(messages), context }),
    signal,
  })
  return readJson(response)
}

export { DEFAULT_LOCAL_ENDPOINT }
