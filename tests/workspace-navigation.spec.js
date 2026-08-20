import { test, expect } from '@playwright/test'

test('merges signals and themes and preserves the fund query across workspace switches', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '市场分析', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '发行洞察', exact: true }).click()
  await expect(page.getByRole('button', { name: '发行洞察', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await expect(page.getByRole('heading', { name: '行情预测', exact: true })).toBeVisible()
  await expect(page.getByText('五主题研判', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '市场分析', exact: true }).click()
  const search = page.getByPlaceholder('搜索基金名称或代码')
  await expect(search).toBeVisible()
  await search.fill('000001')
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await page.getByRole('button', { name: '市场分析', exact: true }).click()
  await expect(search).toHaveValue('000001')
})
