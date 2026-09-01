import crypto from 'node:crypto'
import { databaseConfigured, getPool, reply } from '../_lib/database.js'

const KEYS = new Set(['research-pool', 'market-structure', 'issuance-forecast', 'market-forecast'])
const MAX_FACTS_BYTES = 48_000
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10
const requestBuckets = new Map()
const ALLOWED_BASE_URLS = new Map([
  ['https://open.bigmodel.cn/api/paas/v4', 'zhipu'],
  ['https://api.moonshot.cn/v1', 'kimi'],
  ['https://api.deepseek.com', 'deepseek'],
  ['https://api.openai.com/v1', 'openai'],
])

const cleanText = (value, maximum = 600) => String(value ?? '').replace(/<[^>]*>/g, '').trim().slice(0, maximum)
const cleanList = (value) => Array.isArray(value) ? value.slice(0, 6).map((item) => cleanText(item, 280)).filter(Boolean) : []

function clientAddress(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
}

function isRateLimited(req) {
  const now = Date.now()
  const address = clientAddress(req)
  const recent = (requestBuckets.get(address) || []).filter((time) => now - time < RATE_WINDOW_MS)
  recent.push(now)
  requestBuckets.set(address, recent)
  if (requestBuckets.size > 1000) for (const [key, times] of requestBuckets) if (!times.some((time) => now - time < RATE_WINDOW_MS)) requestBuckets.delete(key)
  return recent.length > RATE_LIMIT
}

function normalizeReport(value, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    headline: cleanText(source.headline || fallback.headline, 120),
    overallJudgment: cleanText(source.overallJudgment || fallback.overallJudgment, 800),
    changeAttribution: cleanList(source.changeAttribution).length ? cleanList(source.changeAttribution) : cleanList(fallback.changeAttribution),
    risks: cleanList(source.risks).length ? cleanList(source.risks) : cleanList(fallback.risks),
    nextActions: cleanList(source.nextActions).length ? cleanList(source.nextActions) : cleanList(fallback.nextActions),
  }
}

function config(req) {
  const sessionBaseUrl = String(req.headers['x-analysis-base-url'] || '').replace(/\/$/, '')
  const sessionKey = String(req.headers['x-analysis-api-key'] || '')
  const sessionModel = String(req.headers['x-analysis-model'] || '')
  if (sessionKey && sessionModel && ALLOWED_BASE_URLS.has(sessionBaseUrl) && /^[a-zA-Z0-9._:-]{1,100}$/.test(sessionModel)) return {
    provider: ALLOWED_BASE_URLS.get(sessionBaseUrl), key: sessionKey.slice(0, 500), model: sessionModel,
    baseUrl: sessionBaseUrl, promptVersion: process.env.ANALYSIS_PROMPT_VERSION || 'v1', sessionCredential: true,
  }
  return {
    provider: process.env.ANALYSIS_PROVIDER || 'openai-compatible',
    key: process.env.ANALYSIS_API_KEY || '',
    model: process.env.ANALYSIS_MODEL || '',
    baseUrl: (process.env.ANALYSIS_BASE_URL || '').replace(/\/$/, ''),
    promptVersion: process.env.ANALYSIS_PROMPT_VERSION || 'v1',
  }
}

async function findCached(pool, analysisKey, dataDate, factsHash, promptVersion, modelConfigured) {
  // Model analysis is a daily close product. Return the first successful model
  // report for this data date even if intraday hot-list facts have changed.
  if (modelConfigured) {
    const daily = await pool.query(`select report, source, provider, model, created_at
      from analysis_reports where analysis_key=$1 and data_date=$2 and prompt_version=$3 and source='model'
      order by created_at asc limit 1`, [analysisKey, dataDate, promptVersion])
    if (daily.rows[0]) return daily.rows[0]
  }
  const result = await pool.query(`select report, source, provider, model, created_at
    from analysis_reports where analysis_key=$1 and data_date=$2 and facts_hash=$3 and prompt_version=$4
      and ($5::boolean=false or source='model')
    order by updated_at desc limit 1`, [analysisKey, dataDate, factsHash, promptVersion, modelConfigured])
  if (result.rows[0]) return result.rows[0]
  if (modelConfigured) return null
  const manual = await pool.query(`select report, source, provider, model, created_at
    from analysis_reports where analysis_key=$1 and data_date=$2 and source='codex-manual'
    order by updated_at desc limit 1`, [analysisKey, dataDate])
  return manual.rows[0] || null
}

async function saveReport(pool, values) {
  await pool.query(`insert into analysis_reports
    (analysis_key,data_date,facts_hash,source,provider,model,prompt_version,report)
    values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    on conflict (analysis_key,data_date,facts_hash,prompt_version) do update set
      source=excluded.source, provider=excluded.provider, model=excluded.model,
      report=excluded.report, updated_at=now()`, values)
}

function parseModelJson(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(text)
}

async function generateModelReport(settings, analysisKey, dataDate, facts, fallback) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 40_000)
  try {
    const requestBody = {
      model: settings.model, temperature: 0.2,
      messages: [
        { role: 'system', content: '你是公募基金产品经理研究助手。只能依据所给结构化事实分析，不得补造数据。输出严格 JSON，不用 Markdown。字段必须为 headline、overallJudgment、changeAttribution、risks、nextActions；后三项均为字符串数组。明确区分事实、推断与待验证事项，不构成投资建议。' },
        { role: 'user', content: JSON.stringify({ task: analysisKey, dataDate, facts, fallback }) },
      ],
      response_format: { type: 'json_object' },
    }
    const request = (body) => fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${settings.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    let response = await request(requestBody)
    if (response.status === 400) {
      const { response_format, ...compatibleBody } = requestBody
      response = await request(compatibleBody)
    }
    if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`)
    const payload = await response.json()
    return normalizeReport(parseModelJson(payload?.choices?.[0]?.message?.content), fallback)
  } finally { clearTimeout(timer) }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: '仅支持 POST' })
  if (isRateLimited(req)) return reply(res, 429, { error: '分析请求过于频繁，请稍后再试' })
  const { analysisKey, dataDate, facts, fallback } = req.body || {}
  if (!KEYS.has(analysisKey) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dataDate || ''))) return reply(res, 400, { error: '分析类型或数据日期无效' })
  const factsText = JSON.stringify(facts || {})
  if (Buffer.byteLength(factsText) > MAX_FACTS_BYTES) return reply(res, 413, { error: '分析事实数据过大' })
  const settings = config(req)
  const modelConfigured = Boolean(settings.key && settings.model && settings.baseUrl)
  const hashInput = modelConfigured ? `${factsText}\n${settings.provider}\n${settings.model}` : factsText
  const factsHash = crypto.createHash('sha256').update(hashInput).digest('hex')
  const pool = databaseConfigured() ? getPool() : null
  try {
    let cached = null
    if (pool) {
      try { cached = await findCached(pool, analysisKey, dataDate, factsHash, settings.promptVersion, modelConfigured) }
      catch (cacheError) { console.error('Dynamic analysis cache read failed', cacheError) }
    }
    if (cached) return reply(res, 200, { report: cached.report, source: cached.source, provider: cached.provider, model: cached.model, cached: true, dataDate })

    let report = normalizeReport(fallback)
    let reportSource = 'rule-fallback'
    let provider = null
    let model = null
    if (modelConfigured) {
      report = await generateModelReport(settings, analysisKey, dataDate, facts, fallback)
      reportSource = 'model'; provider = settings.provider; model = settings.model
    }
    let cacheStored = false
    if (pool) {
      try {
        await saveReport(pool, [analysisKey, dataDate, factsHash, reportSource, provider, model, settings.promptVersion, JSON.stringify(report)])
        cacheStored = true
      } catch (cacheError) {
        console.error('Dynamic analysis cache write failed', cacheError)
      }
    }
    return reply(res, 200, { report, source: reportSource, provider, model, cached: false, cacheStored, dataDate })
  } catch (error) {
    console.error('Dynamic analysis failed', error)
    return reply(res, 200, { report: normalizeReport(fallback), source: 'rule-fallback', provider: null, model: null, cached: false, dataDate, degraded: true })
  }
}
