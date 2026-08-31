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
