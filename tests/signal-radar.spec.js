import { expect, test } from '@playwright/test'

test('shows the decision radar workbench by default', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '信号雷达' }).click()
  await expect(page.getByRole('heading', { name: '今日决策摘要' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '市场环境' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '信号流' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '机会主题' })).toBeVisible()
})

test('filters customer-demand proxies without presenting policy signals', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '信号雷达' }).click()
  await page.getByRole('button', { name: '客户代理' }).click()
  await expect.poll(() => page.locator('[data-signal-category="customer"]').count()).toBeGreaterThan(0)
  await expect(page.getByText('需求代理', { exact: true }).first()).toBeVisible()
  await expect(page.locator('[data-signal-category="policy"]')).toHaveCount(0)
})

test('opens evidence details and persists the opportunity watchlist', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '信号雷达' }).click()
  const trigger = page.locator('[data-signal-id]').first()
  await trigger.click()
  const drawer = page.getByRole('dialog', { name: '信号详情' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('heading', { name: '事实' })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Agent 解读' })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: '传导链' })).toBeVisible()
  await drawer.getByRole('button', { name: '加入机会观察池' }).click()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.reload()
  await page.getByRole('button', { name: '信号雷达' }).click()
  await page.locator('[data-signal-id]').first().click()
  await expect(page.getByRole('button', { name: '移出机会观察池' })).toBeVisible()
})

test('switches between signal radar and fund product library', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '发行洞察' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '信号雷达' }).click()
  await page.getByRole('button', { name: '基金产品库' }).click()
  await expect(page.locator('.search-box input')).toBeVisible()
  await page.getByRole('button', { name: '信号雷达' }).click()
  await expect(page.getByRole('heading', { name: '今日决策摘要' })).toBeVisible()
})
