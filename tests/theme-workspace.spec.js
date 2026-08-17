import { test, expect } from '@playwright/test'

test('theme workspace shows scores, evidence, related funds, and honest history status', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '主题研判', exact: true }).click()
  await expect(page.getByRole('heading', { name: '主题研判总览' })).toBeVisible()
  await expect(page.getByText('黄金', { exact: true })).toBeVisible()
  await expect(page.getByText('红利基金', { exact: true })).toBeVisible()
  await expect(page.getByText('债券基金', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /查看黄金证据/ }).click()
  await expect(page.getByText('历史数据不足，暂不生成情景概率')).toBeVisible()
  await expect(page.getByRole('heading', { name: '相关基金' })).toBeVisible()
  await expect(page.getByText(/不构成投资建议/).first()).toBeVisible()
  const fundButton = page.getByRole('button', { name: '在产品库查看' }).first()
  const card = fundButton.locator('..').locator('..')
  const code = (await card.textContent()).match(/\d{6}/)[0]
  await fundButton.click()
  await expect(page.getByPlaceholder('搜索基金名称或代码')).toHaveValue(code)
})