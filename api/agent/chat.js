const MAX_MESSAGES = 12
const MAX_BODY_BYTES = 90_000
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 12
const requestBuckets = new Map()
const SYSTEM_PROMPT = `你是AI Fund Mate中的公募基金产品经理Agent。你的服务对象是基金产品经理，而不是终端投资者。
回答应聚焦产品方向预研、社会注意力变化、产业和企业验证、资产承载、同类产品供给及产品窗口。
明确区分已知数据、推断和待验证事项；数据不足时不得编造。不要给出个股买卖建议。回答简洁、结构清楚。`

function reply(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').end(JSON.stringify(payload))
}

function clientAddress(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
}

function isRateLimited(req) {
  const now = Date.now()
  const key = clientAddress(req)
  const recent = (requestBuckets.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS)
  recent.push(now)
  requestBuckets.set(key, recent)
  if (requestBuckets.size > 1000) for (const [address, times] of requestBuckets) if (!times.some((time) => now - time < RATE_WINDOW_MS)) requestBuckets.delete(address)
  return recent.length > RATE_LIMIT
}

export default async function handler(req, res) {
  if (req.method === 'GET') return reply(res, 200, { configured: Boolean(process.env.AGENT_API_KEY && process.env.AGENT_MODEL), provider: process.env.AGENT_PROVIDER || 'openai-compatible', model: process.env.AGENT_MODEL || null })
  if (req.method !== 'POST') return reply(res, 405, { error: '仅支持GET和POST' })
  if (isRateLimited(req)) return reply(res, 429, { error: '请求过于频繁，请稍后再试' })
  const apiKey = process.env.AGENT_API_KEY
  const baseUrl = (process.env.AGENT_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.AGENT_MODEL
  if (!apiKey || !model) return reply(res, 503, { error: '云端模型尚未配置。可在Vercel设置AGENT_API_KEY、AGENT_MODEL和可选的AGENT_BASE_URL，或在Agent设置中切换本地Ollama。', code: 'MODEL_NOT_CONFIGURED' })
  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  } catch {
    return reply(res, 400, { error: '请求内容不是有效JSON' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) return reply(res, 413, { error: '对话内容过长，请清空对话后重试' })
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES).filter((item) => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').map((item) => ({ role: item.role, content: item.content.slice(0, 6000) })) : []
  if (!messages.length) return reply(res, 400, { error: '缺少有效对话内容' })
  const context = JSON.stringify(body.context || {}).slice(0, 4000)
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n当前页面上下文：${context}` }, ...messages] }), signal: AbortSignal.timeout(45000) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return reply(res, 502, { error: payload.error?.message || `上游模型请求失败（${response.status}）` })
    const content = payload.choices?.[0]?.message?.content
    if (!content) return reply(res, 502, { error: '上游模型未返回有效文本' })
    return reply(res, 200, { content, provider: process.env.AGENT_PROVIDER || 'openai-compatible', model })
  } catch (error) {
    const message = error.name === 'TimeoutError' ? '模型响应超时，请稍后重试' : `模型服务暂时不可用：${error.message}`
    return reply(res, 502, { error: message })
  }
}
