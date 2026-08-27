import { expect, test } from '@playwright/test'

test('opens the product-manager agent and sends workspace context through the unified API', async ({ page }) => {
  let capturedBody
  await page.route('**/api/agent/chat', async (route) => {
    capturedBody = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: '当前窗口需要同时检查注意力与产品供给。', provider: 'test', model: 'test-model' }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Agent\s*产品经理助手/ }).click()
  const panel = page.getByRole('complementary', { name: '产品经理Agent' })
  await expect(panel).toBeVisible()
  await expect(panel.getByText('已同步')).toBeVisible()
  const starterBox = await panel.getByRole('button', { name: '解释当前产品窗口' }).boundingBox()
  expect(starterBox.height).toBeLessThan(50)
  await panel.getByRole('button', { name: '解释当前产品窗口' }).click()
  await expect(panel.getByText('当前窗口需要同时检查注意力与产品供给。')).toBeVisible()
  expect(capturedBody.context.workspace).toBe('预研产品池')
  expect(capturedBody.context.workspaceData.coreDirections).toHaveLength(10)
  expect(capturedBody.messages.at(-1).content).toBe('解释当前产品窗口')
})

test('keeps local model configuration in the browser and exposes no API key field', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Agent\s*产品经理助手/ }).click()
  const panel = page.getByRole('complementary', { name: '产品经理Agent' })
  await panel.getByRole('button', { name: '模型设置' }).click()
  await panel.getByLabel('模型来源').selectOption('local')
  await expect(panel.getByLabel('本地接口')).toHaveValue('http://127.0.0.1:11434/api/chat')
  await expect(panel.getByLabel('模型名称')).toHaveValue('qwen3:8b')
  await expect(panel.getByText('本地模式不会上传对话')).toBeVisible()
  await expect(panel.getByLabel(/API.*密钥/i)).toHaveCount(0)
})

test('aborts an in-flight request when the conversation is cleared', async ({ page }) => {
  await page.route('**/api/agent/chat', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { configured: true, model: 'test-model' } })
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    return route.fulfill({ json: { content: '不应出现' } }).catch(() => {})
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Agent\s*产品经理助手/ }).click()
  const panel = page.getByRole('complementary', { name: '产品经理Agent' })
  await expect(panel.getByText('已同步')).toBeVisible()
  await panel.getByRole('button', { name: '解释当前产品窗口' }).click()
  await expect(panel.getByText('正在分析…')).toBeVisible()
  await panel.getByRole('button', { name: '清空对话' }).click()
  await expect(panel.getByText('正在分析…')).toHaveCount(0)
  await expect(panel.getByText('我是产品经理Agent。')).toBeVisible()
})
