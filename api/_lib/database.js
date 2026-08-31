import pg from 'pg'

const { Pool } = pg
let pool

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

export function getPool() {
  if (!databaseConfigured()) throw new Error('DATABASE_NOT_CONFIGURED')
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
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
  return error?.message === 'DATABASE_NOT_CONFIGURED'
    ? { status: 503, payload: { error: '历史数据库尚未配置', code: 'DATABASE_NOT_CONFIGURED' } }
    : { status: 500, payload: { error: '历史数据暂时不可用', code: 'DATABASE_QUERY_FAILED' } }
}
