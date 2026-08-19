import { expect, test } from '@playwright/test'

test('shows a global market brief and a decision-oriented opportunity matrix', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('全局发行市场信息')).toBeVisible()
  await expect(page.getByLabel('全局发行市场信息').getByText('待发行预告', { exact: true })).toBeVisible()
  await expect(page.getByLabel('全局发行市场信息').getByText('今年异常退出跟踪', { exact: true })).toBeVisible()
  await expect(page.getByText('规模变化线索')).toHaveCount(0)

  await page.getByRole('button', { name: '板块机会', exact: true }).click()
  await expect(page.getByRole('heading', { name: '板块热度与发行机会' })).toBeVisible()
  await expect(page.getByLabel('动态板块热度榜')).toBeVisible()
  await expect(page.getByText(/热度 = 50/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /全部构成基金/ })).toBeVisible()
})
