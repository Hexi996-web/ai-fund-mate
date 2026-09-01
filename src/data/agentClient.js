import { getSessionAnalysisSettings } from './dynamicAnalysis.js'

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

export async function sendAgentMessage({ messages, context, signal }) {
  const settings = getSessionAnalysisSettings()
  const headers = { 'Content-Type': 'application/json' }
  if (settings.apiKey && settings.model && settings.baseUrl) {
    headers['X-Analysis-Api-Key'] = settings.apiKey
    headers['X-Analysis-Model'] = settings.model
    headers['X-Analysis-Base-Url'] = settings.baseUrl
  }
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages: cleanMessages(messages), context }),
    signal,
  })
  return readJson(response)
}
