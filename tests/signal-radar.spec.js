import { expect, test } from '@playwright/test'

test('replaces the raw signal feed with a decision-grade opportunity workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '板块机会' }).click()
  await expect(page.getByRole('heading', { name: '板块热度与发行机会' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '信号流' })).toHaveCount(0)
})

test('opens a matrix theme and keeps the product-library handoff', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '板块机会' }).click()
  await page.getByLabel('动态板块热度榜').locator('button').nth(1).click()
  await expect(page.getByRole('heading', { name: /全部构成基金/ })).toBeVisible()
  await page.getByRole('button', { name: '基金产品库' }).click()
  await expect(page.locator('.search-box input')).toBeVisible()
})
