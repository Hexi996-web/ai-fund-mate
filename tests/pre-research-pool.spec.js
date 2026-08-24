import { test, expect } from '@playwright/test'

test('shows public-data evidence and drills into product supply', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '预研产品池', exact: true }).click()
  await expect(page.getByRole('heading', { name: '季度预研产品池' })).toBeVisible()
  await expect(page.getByText('四层证据快照')).toBeVisible()
  await expect(page.getByText('结构驱动', { exact: true })).toBeVisible()
  await expect(page.getByText('企业兑现代理', { exact: true })).toBeVisible()
  await expect(page.getByText('资产承载', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /同类基金/ }).click()
  await expect(page.getByRole('heading', { name: '全部同类基金' })).toBeVisible()
})
