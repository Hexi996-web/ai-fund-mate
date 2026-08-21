import { test, expect } from '@playwright/test'

test('opens and filters the pre-research product pool', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '预研产品池', exact: true }).click()
  await expect(page.getByRole('heading', { name: '预研产品池', exact: true })).toBeVisible()
  await expect(page.locator('.research-card')).toHaveCount(10)
  await expect(page.getByText('人工智能+行动', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '有量化数据 2', exact: true }).click()
  await expect(page.locator('.research-card')).toHaveCount(2)
  await page.getByRole('button', { name: /新型电力系统/ }).click()
  await expect(page.getByText('1.36亿千瓦 / 3.51亿千瓦时', { exact: true })).toBeVisible()
})
