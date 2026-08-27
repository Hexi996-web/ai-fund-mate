import { expect, test } from '@playwright/test'
import handler from '../api/agent/chat.js'

function invoke(req) {
  return new Promise((resolve) => {
    const response = {
      statusCode: 200,
      headers: {},
      status(code) { this.statusCode = code; return this },
      setHeader(name, value) { this.headers[name] = value; return this },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) },
    }
    handler({ headers: {}, ...req }, response)
  })
}

test('reports cloud configuration only when both key and model exist', async () => {
  const oldKey = process.env.AGENT_API_KEY
  const oldModel = process.env.AGENT_MODEL
  process.env.AGENT_API_KEY = 'test-key'
  delete process.env.AGENT_MODEL
  expect((await invoke({ method: 'GET' })).body.configured).toBe(false)
  process.env.AGENT_MODEL = 'test-model'
  expect((await invoke({ method: 'GET' })).body.configured).toBe(true)
  if (oldKey === undefined) delete process.env.AGENT_API_KEY; else process.env.AGENT_API_KEY = oldKey
  if (oldModel === undefined) delete process.env.AGENT_MODEL; else process.env.AGENT_MODEL = oldModel
})

test('rejects malformed and oversized model requests before upstream calls', async () => {
  process.env.AGENT_API_KEY = 'test-key'
  process.env.AGENT_MODEL = 'test-model'
  const malformed = await invoke({ method: 'POST', body: '{', headers: { 'x-forwarded-for': 'agent-invalid' } })
  expect(malformed.status).toBe(400)
  const oversized = await invoke({ method: 'POST', body: { messages: [{ role: 'user', content: 'x'.repeat(100_000) }] }, headers: { 'x-forwarded-for': 'agent-large' } })
  expect(oversized.status).toBe(413)
  delete process.env.AGENT_API_KEY
  delete process.env.AGENT_MODEL
})
