import { test, expect } from '@playwright/test'

test('shows transparent market measurements instead of raw evidence', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await expect(page.getByText('年内收益中位数', { exact: true })).toBeVisible()
  await expect(page.getByLabel('分类行情预测').getByText('规模净增额', { exact: true })).toBeVisible()
  await expect(page.getByText('最大回撤中位数', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('置信度')
})
