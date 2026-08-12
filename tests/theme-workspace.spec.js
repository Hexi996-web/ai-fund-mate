import { test, expect } from '@playwright/test'

test('theme workspace shows scores evidence and insufficient history', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '五主题研判' }).click()
  await expect(page.getByRole('heading', { name: '五主题研究总览' })).toBeVisible()
  await expect(page.getByText('黄金', { exact: true })).toBeVisible()
  await expect(page.getByText('57.5')).toBeVisible()
  await page.getByRole('button', { name: /查看黄金证据/ }).click()
  await expect(page.getByText('历史数据不足，暂不生成情景概率')).toBeVisible()
  await expect(page.getByText(/研究机会试算/)).toBeVisible()
})
