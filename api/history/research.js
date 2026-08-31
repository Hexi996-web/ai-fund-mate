import { boundedInteger, getPool, publicDatabaseError, reply } from '../_lib/database.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: '仅支持 GET' })
  const themeId = String(req.query?.themeId || '').trim()
  if (!/^[a-z0-9-]{1,80}$/i.test(themeId)) return reply(res, 400, { error: '缺少有效 themeId' })
  const days = boundedInteger(req.query?.days, 370, 1095)
  try {
    const [attention, signals] = await Promise.all([
      getPool().query(`select data_date,appearances,resonance,best_rank,sample_count,source_updated_at
        from theme_attention_daily where theme_id=$1 and data_date >= current_date-$2::integer
        order by data_date`, [themeId, days]),
      getPool().query(`select distinct on (data_date) data_date,methodology_version,attention_score,
        validation_score,capacity_score,composite_score,rank,lifecycle_state,source_updated_at
        from theme_daily_signals where theme_id=$1 and data_date >= current_date-$2::integer
        order by data_date,methodology_version desc`, [themeId, days]),
    ])
    return reply(res, 200, { themeId, days, attention: attention.rows, signals: signals.rows })
  } catch (error) {
    const safe = publicDatabaseError(error); return reply(res, safe.status, safe.payload)
  }
}
