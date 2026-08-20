import { expect, test } from '@playwright/test'

test('replaces the raw signal feed with a data-driven forecast workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '行情预测' }).click()
  await expect(page.getByRole('heading', { name: '行情预测', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '信号流' })).toHaveCount(0)
})

test('opens a forecast category and keeps the market-analysis handoff', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '行情预测' }).click()
  await page.getByLabel('分类行情预测').locator('button').nth(1).click()
  await expect(page.getByRole('heading', { name: /构成产品/ })).toBeVisible()
  await page.getByRole('button', { name: '市场分析', exact: true }).click()
  await expect(page.locator('.search-box input')).toBeVisible()
})
