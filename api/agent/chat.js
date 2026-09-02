const MAX_MESSAGES = 12
const MAX_BODY_BYTES = 90_000
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 12
const requestBuckets = new Map()
const ALLOWED_BASE_URLS = new Map([['https://open.bigmodel.cn/api/paas/v4','zhipu'],['https://api.moonshot.cn/v1','kimi'],['https://api.deepseek.com','deepseek'],['https://api.openai.com/v1','openai']])
const SYSTEM_PROMPT = `你是AI Fund Mate中的公募基金简报助手。你的服务对象是基金产品经理，而不是终端投资者。
回答应结合当前公募基金简报、预研产品池、行情综合研判及历史上下文，聚焦数据解释、跨板块比较、证据链和下一步跟踪。
你必须能够解释页面的四象限坐标与阈值、圆点含义、核心10与三个期限榜单的权重公式、升降箭头比较方法、更新频率、数据来源、份额合并、规模估算、缺失值、历史存储和AI分析边界。优先依据pageKnowledge回答方法论问题，依据workspaces与pageContext回答当前结果；不得把核心10权重与期限榜单权重混为一谈。四象限横轴只能引用opportunityScore，纵轴只能引用attentionScore或attention；不得用productValidation近似替代综合产品机会。
明确区分已知数据、推断和待验证事项；数据不足时不得编造。引用数字时说明数据日期和口径。不要给出个股买卖建议。回答简洁、结构清楚。
你可以调用白名单只读页面工具帮助用户定位信息，但不得修改数据、触发更新或执行外部操作。`
const TOOLS = [
  { type: 'function', function: { name: 'switch_workspace', description: '切换到指定工作板块', parameters: { type: 'object', properties: { workspace: { type: 'string', enum: ['预研产品池', '公募基金简报', '行情预测'] } }, required: ['workspace'] } } },
  { type: 'function', function: { name: 'focus_research_theme', description: '在预研产品池定位一个方向', parameters: { type: 'object', properties: { themeId: { type: 'string' }, themeName: { type: 'string' } } } } },
  { type: 'function', function: { name: 'set_fund_filters', description: '在公募基金简报设置查询、分类或排序', parameters: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' }, sortMode: { type: 'string', enum: ['scale-desc', 'scale-growth-desc', 'nav-growth-desc', 'drawdown-desc', 'date-desc'] } } } } },
  { type: 'function', function: { name: 'focus_forecast_category', description: '在行情预测定位一个基金分类', parameters: { type: 'object', properties: { categoryId: { type: 'string' }, categoryName: { type: 'string' } } } } },
]
const ACTION_LABELS = { switch_workspace: '切换工作板块', focus_research_theme: '定位预研方向', set_fund_filters: '设置基金筛选', focus_forecast_category: '定位行情分类' }

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
  if (req.method === 'GET') return reply(res, 200, { configured: Boolean((process.env.ANALYSIS_API_KEY && process.env.ANALYSIS_MODEL) || (process.env.AGENT_API_KEY && process.env.AGENT_MODEL)), provider: process.env.ANALYSIS_PROVIDER || process.env.AGENT_PROVIDER || 'openai-compatible', model: process.env.ANALYSIS_MODEL || process.env.AGENT_MODEL || null })
  if (req.method !== 'POST') return reply(res, 405, { error: '仅支持GET和POST' })
  if (isRateLimited(req)) return reply(res, 429, { error: '请求过于频繁，请稍后再试' })
  const sessionBaseUrl = String(req.headers['x-analysis-base-url'] || '').replace(/\/$/, '')
  const sessionModel = String(req.headers['x-analysis-model'] || '')
  const sessionKey = String(req.headers['x-analysis-api-key'] || '')
  const sessionValid = sessionKey && ALLOWED_BASE_URLS.has(sessionBaseUrl) && /^[a-zA-Z0-9._:-]{1,100}$/.test(sessionModel)
  const apiKey = sessionValid ? sessionKey.slice(0,500) : (process.env.ANALYSIS_API_KEY || process.env.AGENT_API_KEY)
  const baseUrl = sessionValid ? sessionBaseUrl : (process.env.ANALYSIS_BASE_URL || process.env.AGENT_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = sessionValid ? sessionModel : (process.env.ANALYSIS_MODEL || process.env.AGENT_MODEL)
  const provider = sessionValid ? ALLOWED_BASE_URLS.get(sessionBaseUrl) : (process.env.ANALYSIS_PROVIDER || process.env.AGENT_PROVIDER || 'openai-compatible')
  if (!apiKey || !model) return reply(res, 503, { error: '尚未配置分析模型。请打开右下角“简报助手”的模型设置，填写智谱等模型信息。', code: 'MODEL_NOT_CONFIGURED' })
  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  } catch {
    return reply(res, 400, { error: '请求内容不是有效JSON' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) return reply(res, 413, { error: '对话内容过长，请清空对话后重试' })
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES).filter((item) => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').map((item) => ({ role: item.role, content: item.content.slice(0, 6000) })) : []
  if (!messages.length) return reply(res, 400, { error: '缺少有效对话内容' })
  const context = JSON.stringify(body.context || {}).slice(0, 24_000)
  try {
    const requestBody = { model, temperature: 0.2, messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n当前页面上下文：${context}` }, ...messages], tools: TOOLS, tool_choice: 'auto' }
    let response = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(45000) })
    let payload = await response.json().catch(() => ({}))
    if (response.status === 400 && payload.error) {
      const { tools, tool_choice, ...withoutTools } = requestBody
      response = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(withoutTools), signal: AbortSignal.timeout(45000) })
      payload = await response.json().catch(() => ({}))
    }
    if (!response.ok) return reply(res, 502, { error: payload.error?.message || `上游模型请求失败（${response.status}）` })
    const message = payload.choices?.[0]?.message
    const actions = (message?.tool_calls || []).flatMap((call) => {
      if (call.type !== 'function' || !ACTION_LABELS[call.function?.name]) return []
      try { return [{ name: call.function.name, label: ACTION_LABELS[call.function.name], arguments: JSON.parse(call.function.arguments || '{}') }] } catch { return [] }
    })
    const content = message?.content || (actions.length ? '已根据你的要求定位页面内容。' : '')
    if (!content) return reply(res, 502, { error: '上游模型未返回有效文本' })
    const sources = Array.isArray(body.context?.sources) ? body.context.sources.slice(0, 4).filter((source) => typeof source?.label === 'string' && /^\/[a-z0-9_./-]+$/i.test(source?.href || '')) : []
    return reply(res, 200, { content, actions, sources, provider, model })
  } catch (error) {
    const message = error.name === 'TimeoutError' ? '模型响应超时，请稍后重试' : `模型服务暂时不可用：${error.message}`
    return reply(res, 502, { error: message })
  }
}
