import { boundedInteger, getPool, isoDate, publicDatabaseError, reply } from '../_lib/database.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: '仅支持 GET' })
  const code = String(req.query?.code || '').trim()
  if (!/^\d{6}$/.test(code)) return reply(res, 400, { error: 'code 必须是六位基金代码' })
  const from = isoDate(req.query?.from); const to = isoDate(req.query?.to)
  if (req.query?.from && !from || req.query?.to && !to) return reply(res, 400, { error: '日期必须使用 YYYY-MM-DD' })
  const limit = boundedInteger(req.query?.limit, 366, 2000)
  try {
    const result = await getPool().query(`select o.data_date, o.net_value, o.daily_change_percent,
      o.scale_yi, o.total_shares_yi, o.purchase_status, o.redemption_status, o.operation_status,
      o.source_updated_at, o.ingested_at
      from fund_share_daily_observations o where o.fund_code = $1
      and ($2::date is null or o.data_date >= $2::date)
      and ($3::date is null or o.data_date <= $3::date)
      order by o.data_date desc limit $4`, [code, from, to, limit])
    return reply(res, 200, { code, from, to, count: result.rowCount, observations: result.rows })
  } catch (error) {
    const safe = publicDatabaseError(error); return reply(res, safe.status, safe.payload)
  }
}
