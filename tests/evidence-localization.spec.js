import { test, expect } from '@playwright/test'

test('shows transparent market measurements instead of raw evidence', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '板块机会', exact: true }).click()
  await expect(page.getByText(/热度 = 50/)).toBeVisible()
  await expect(page.getByText('当日平均涨跌', { exact: true })).toBeVisible()
  await expect(page.getByText('上涨宽度', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('置信度')
})
