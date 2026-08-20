import { test, expect } from '@playwright/test'

test('forecast workspace reveals the products behind each classification', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await expect(page.getByRole('heading', { name: '行情预测', exact: true })).toBeVisible()
  const firstSector = page.getByLabel('分类行情预测').locator('button').first()
  await firstSector.click()
  await expect(page.locator('.forecast-funds > button').first()).toBeVisible()
})
