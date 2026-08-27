const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:11434/api/chat'

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
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'qwen3:8b', messages: cleanMessages(messages), stream: false }),
      signal,
    })
    const payload = await readJson(response)
    return { content: payload.message?.content || payload.response || '本地模型未返回文本', provider: 'local', model: payload.model || model }
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
