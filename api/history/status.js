import { databaseConfigured, getPool, publicDatabaseError, reply } from '../_lib/database.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: '仅支持 GET' })
  if (!databaseConfigured()) return reply(res, 200, { configured: false, latestRun: null, datasets: [] })
  try {
    const [runResult, snapshotResult] = await Promise.all([
      getPool().query(`select run_key, data_date, status, started_at, completed_at, metadata
        from pipeline_runs order by started_at desc limit 1`),
      getPool().query(`select distinct on (dataset_name) dataset_name, snapshot_date, row_count, imported_at
        from data_snapshots order by dataset_name, snapshot_date desc, imported_at desc`),
    ])
    return reply(res, 200, { configured: true, latestRun: runResult.rows[0] || null, datasets: snapshotResult.rows })
  } catch (error) {
    const safe = publicDatabaseError(error); return reply(res, safe.status, safe.payload)
  }
}
