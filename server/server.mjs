import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import agentChat from '../api/agent/chat.js'
import analysisReport from '../api/analysis/report.js'
import historyFunds from '../api/history/funds.js'
import historyResearch from '../api/history/research.js'
import historyStatus from '../api/history/status.js'
import historyThemes from '../api/history/themes.js'
import { databaseConfigurationIssue } from '../api/_lib/database.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
const port = Number(process.env.PORT || 8800)
const host = process.env.HOST || '127.0.0.1'
const maxBodyBytes = 1_000_000

const apiRoutes = new Map([
  ['/api/agent/chat', agentChat],
  ['/api/analysis/report', analysisReport],
  ['/api/history/funds', historyFunds],
  ['/api/history/research', historyResearch],
  ['/api/history/status', historyStatus],
  ['/api/history/themes', historyThemes],
])

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBodyBytes) throw Object.assign(new Error('REQUEST_TOO_LARGE'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }) }
}

async function runApi(handler, req, res, url) {
  req.query = Object.fromEntries(url.searchParams.entries())
  if (req.method !== 'GET' && req.method !== 'HEAD') req.body = await readBody(req)
  res.status = (status) => { res.statusCode = status; return res }
  await handler(req, res)
}

function staticPath(pathname) {
  const decoded = decodeURIComponent(pathname)
  const candidate = normalize(join(dist, decoded === '/' ? 'index.html' : decoded))
  if (!candidate.startsWith(`${dist}${sep}`) && candidate !== dist) return null
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(dist, 'index.html')
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname === '/healthz') return sendJson(res, 200, {
      status: 'ok',
      database: databaseConfigurationIssue() || 'configured',
      analysis: process.env.ANALYSIS_API_KEY && process.env.ANALYSIS_MODEL ? 'configured' : 'not_configured',
    })
    const handler = apiRoutes.get(url.pathname)
    if (handler) return await runApi(handler, req, res, url)
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: '接口不存在' })
    const file = staticPath(url.pathname)
    if (!file || !existsSync(file)) return sendJson(res, 503, { error: '网站尚未构建' })
    const immutable = /\/assets\//.test(url.pathname)
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res)
  } catch (error) {
    console.error('Request failed', error)
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : '服务暂时不可用' })
    else res.end()
  }
})

server.listen(port, host, () => console.log(`AI Fund Mate listening on http://${host}:${port}`))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
