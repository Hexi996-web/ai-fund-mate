import { expect, test } from '@playwright/test'
import fundsHandler from '../api/history/funds.js'
import statusHandler from '../api/history/status.js'

function responseRecorder() {
  return {
    statusCode: null, headers: {}, payload: null,
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name] = value; return this },
    end(body) { this.payload = JSON.parse(body); return this },
  }
}

test('history fund endpoint rejects an invalid code before database access', async () => {
  const response = responseRecorder()
  await fundsHandler({ method: 'GET', query: { code: 'abc' } }, response)
  expect(response.statusCode).toBe(400)
  expect(response.payload.error).toContain('六位基金代码')
})

test('history status reports an unconfigured database safely', async () => {
  const original = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  const response = responseRecorder()
  await statusHandler({ method: 'GET', query: {} }, response)
  if (original) process.env.DATABASE_URL = original
  expect(response.statusCode).toBe(200)
  expect(response.payload.configured).toBe(false)
})

test('history status rejects Supabase direct and transaction-pooler URLs', async () => {
  const original = process.env.DATABASE_URL
  for (const url of [
    'postgresql://postgres:secret@db.project.supabase.co:5432/postgres',
    'postgresql://postgres.project:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ]) {
    process.env.DATABASE_URL = url
    const response = responseRecorder()
    await statusHandler({ method: 'GET', query: {} }, response)
    expect(response.payload.configured).toBe(false)
    expect(response.payload.configurationIssue).toBe('DATABASE_SESSION_POOLER_REQUIRED')
  }
  if (original) process.env.DATABASE_URL = original
  else delete process.env.DATABASE_URL
})

test('research history endpoint rejects an invalid theme before database access', async () => {
  const handler = (await import('../api/history/research.js')).default
  const response = responseRecorder()
  await handler({ method: 'GET', query: { themeId: '../unsafe' } }, response)
  expect(response.statusCode).toBe(400)
})
