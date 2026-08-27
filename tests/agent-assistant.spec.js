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
  await panel.getByRole('button', { name: '解释当前产品窗口' }).click()
  await expect(panel.getByText('当前窗口需要同时检查注意力与产品供给。')).toBeVisible()
  expect(capturedBody.context.workspace).toBe('预研产品池')
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
