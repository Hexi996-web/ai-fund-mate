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

test('normalizes whitelisted tool calls and safe evidence links', async () => {
  const originalFetch = global.fetch
  process.env.AGENT_API_KEY = 'test-key'
  process.env.AGENT_MODEL = 'test-model'
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ type: 'function', function: { name: 'switch_workspace', arguments: '{"workspace":"市场分析"}' } }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const result = await invoke({ method: 'POST', headers: { 'x-forwarded-for': 'agent-tools' }, body: { messages: [{ role: 'user', content: '打开市场分析' }], context: { sources: [{ label: '基金快照', href: '/fund_products.json' }, { label: '危险链接', href: 'https://example.com' }] } } })
  expect(result.status).toBe(200)
  expect(result.body.actions).toEqual([{ name: 'switch_workspace', label: '切换工作板块', arguments: { workspace: '市场分析' } }])
  expect(result.body.sources).toEqual([{ label: '基金快照', href: '/fund_products.json' }])
  global.fetch = originalFetch
  delete process.env.AGENT_API_KEY
  delete process.env.AGENT_MODEL
})
