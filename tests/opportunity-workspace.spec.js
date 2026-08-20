import { expect, test } from '@playwright/test'

test('omits deleted workspaces and shows the interactive forecast matrix', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('全局发行市场信息')).toHaveCount(0)
  await expect(page.getByText('市场决策摘要', { exact: true })).toHaveCount(0)
  await expect(page.getByText('规模变化线索')).toHaveCount(0)

  await expect(page.getByRole('button', { name: '板块机会', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await expect(page.getByLabel('分类行情预测')).toBeVisible()
  const baseline = page.getByLabel('基准判断动态信号')
  await expect(baseline).toContainText('当前判断：')
  await expect(baseline).toContainText('产品经理含义：')
  await expect(baseline).toContainText('判断切换条件：')
  await expect(baseline.getByRole('button')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: '宏观与行业校准' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /构成产品/ })).toBeVisible()
  await expect(page.getByLabel('预测构成基金排序')).toHaveValue('nav')
  const firstReturn = await page.locator('.forecast-funds > button').first().innerText()
  await page.getByLabel('预测构成基金排序').selectOption('scale')
  const firstScale = await page.locator('.forecast-funds > button').first().innerText()
  expect(firstScale).not.toBe(firstReturn)
})
