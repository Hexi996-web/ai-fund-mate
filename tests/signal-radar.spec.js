import { expect, test } from '@playwright/test'

test('replaces the raw signal feed with a decision-grade opportunity workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '板块机会' }).click()
  await expect(page.getByRole('heading', { name: '板块热度与发行机会矩阵' })).toBeVisible()
  await expect(page.getByText(/条决策级信号/)).toBeVisible()
  await expect(page.getByText(/条杂讯已降噪/)).toBeVisible()
  await expect(page.getByRole('heading', { name: '信号流' })).toHaveCount(0)
})

test('opens a matrix theme and keeps the product-library handoff', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '板块机会' }).click()
  await page.getByRole('button', { name: /^AI与半导体/ }).click()
  await expect(page.getByRole('button', { name: '查看AI与半导体证据' })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: '基金产品库' }).click()
  await expect(page.locator('.search-box input')).toBeVisible()
})
