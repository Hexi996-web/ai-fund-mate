import { test, expect } from '@playwright/test'

test('opens and filters the pre-research product pool', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '预研产品池', exact: true }).click()
  await expect(page.getByRole('heading', { name: '预研产品池', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(10)
  await expect(page.getByText('优先载体', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'B级 3', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  await page.getByRole('button', { name: /商业航天与卫星互联网基础设施/ }).click()
  await expect(page.getByText('发射频次、组网部署和终端数据服务形成经常性收入。')).toBeVisible()
})
