import { expect, test } from '@playwright/test'

test('shows a global market brief and a decision-oriented opportunity matrix', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('全局发行市场信息')).toBeVisible()
  await expect(page.getByText('规模变化线索')).toBeVisible()

  await page.getByRole('button', { name: '板块机会', exact: true }).click()
  await expect(page.getByRole('heading', { name: '板块热度与发行机会矩阵' })).toBeVisible()
  await expect(page.getByLabel('发行机会矩阵')).toBeVisible()
  await expect(page.getByText(/条杂讯已降噪/)).toBeVisible()
})
