import { boundedInteger, getPool, isoDate, publicDatabaseError, reply } from '../_lib/database.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: '仅支持 GET' })
  const themeId = String(req.query?.themeId || '').trim()
  if (!/^[a-z0-9-]{1,80}$/i.test(themeId)) return reply(res, 400, { error: '缺少有效 themeId' })
  const from = isoDate(req.query?.from); const to = isoDate(req.query?.to)
  if (req.query?.from && !from || req.query?.to && !to) return reply(res, 400, { error: '日期必须使用 YYYY-MM-DD' })
  const limit = boundedInteger(req.query?.limit, 366, 2000)
  try {
    const result = await getPool().query(`select data_date, methodology_version, attention_score,
      validation_score, capacity_score, composite_score, rank, lifecycle_state,
      source_updated_at, ingested_at from theme_daily_signals where theme_id = $1
      and ($2::date is null or data_date >= $2::date) and ($3::date is null or data_date <= $3::date)
      order by data_date desc, methodology_version desc limit $4`, [themeId, from, to, limit])
    return reply(res, 200, { themeId, from, to, count: result.rowCount, signals: result.rows })
  } catch (error) {
    const safe = publicDatabaseError(error); return reply(res, safe.status, safe.payload)
  }
}
