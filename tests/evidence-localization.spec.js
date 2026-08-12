import { test, expect } from '@playwright/test'

test('renders evidence rules and data gaps in readable Chinese', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /查看黄金证据/ }).click()
  await expect(page.getByText('数据缺口与可信度说明', { exact: true })).toBeVisible()
  await expect(page.getByText(/美国10年期实际利率/)).toBeVisible()
  await expect(page.getByText(/估值与宏观交叉验证能力下降/)).toBeVisible()
  await expect(page.getByText(/当前仅有单期数据/).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('source_unavailable')
  await expect(page.locator('body')).not.toContainText('single snapshot confirms availability only')
  await expect(page.locator('body')).not.toContainText('`n')
})
