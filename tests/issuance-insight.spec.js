import { expect, test } from '@playwright/test'

test('shows issuance rankings and current purchase suspensions on the home workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '发行洞察', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: '基金发行市场洞察' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '发行成功榜' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '暂停申购追踪' })).toBeVisible()
  await page.getByRole('tab', { name: '今年以来' }).click()
  await expect(page.locator('tbody tr').first()).toBeVisible()
})

test('keeps the requested top-level workspace order', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.workspace-nav button').allTextContents()).resolves.toEqual([
    '发行洞察', '信号雷达', '主题研判', '基金产品库',
  ])
})
