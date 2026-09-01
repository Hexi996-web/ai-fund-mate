import pg from 'pg'

const { Pool } = pg
let pool

export function databaseConfigurationIssue() {
  const value = process.env.DATABASE_URL
  if (!value) return 'DATABASE_NOT_CONFIGURED'
  try {
    const url = new URL(value)
    const sessionPooler = url.hostname.endsWith('.pooler.supabase.com') && (url.port || '5432') === '5432'
    return sessionPooler ? null : 'DATABASE_SESSION_POOLER_REQUIRED'
  } catch {
    return 'DATABASE_URL_INVALID'
  }
}

export function databaseConfigured() {
  return databaseConfigurationIssue() === null
}

export function getPool() {
  const issue = databaseConfigurationIssue()
  if (issue) throw new Error(issue)
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
      options: '-c search_path=history,public',
    })
  }
  return pool
}

export function reply(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', status === 200 ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store')
    .end(JSON.stringify(payload))
}

export function isoDate(value) {
  if (!value) return null
  const text = String(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

export function boundedInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), maximum) : fallback
}

export function publicDatabaseError(error) {
  console.error('History API database error', error)
  if (error?.message === 'DATABASE_NOT_CONFIGURED') return { status: 503, payload: { error: '历史数据库尚未配置', code: error.message } }
  if (error?.message === 'DATABASE_SESSION_POOLER_REQUIRED') return { status: 503, payload: { error: '数据库必须配置 Supabase IPv4 Session pooler（端口 5432）', code: error.message } }
  if (error?.message === 'DATABASE_URL_INVALID') return { status: 503, payload: { error: '数据库连接地址格式无效', code: error.message } }
  return { status: 500, payload: { error: '历史数据暂时不可用', code: 'DATABASE_QUERY_FAILED' } }
}
