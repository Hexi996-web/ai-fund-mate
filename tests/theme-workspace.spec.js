import { test, expect } from '@playwright/test'

test('dynamic sector workspace reveals the products behind the supply count', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '板块机会', exact: true }).click()
  await expect(page.getByRole('heading', { name: '板块热度与发行机会' })).toBeVisible()
  const firstSector = page.getByLabel('动态板块热度榜').locator('button').first()
  await expect(firstSector).toContainText('只')
  await firstSector.click()
  await expect(page.locator('.sector-fund-table > div').nth(1)).toBeVisible()
})
