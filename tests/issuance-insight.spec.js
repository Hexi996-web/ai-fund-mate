import { expect, test } from '@playwright/test'

test('shows issuance rankings and current purchase suspensions on the home workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '发行洞察', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: '基金发行市场洞察' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '发行成功榜' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '暂停申购追踪' })).toBeVisible()
  await page.getByRole('tab', { name: '今年以来' }).click()
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await expect(page.getByLabel('排序指标')).toHaveValue('establishedDate')
  await page.getByLabel('排序指标').selectOption('latestScaleYi')
  await expect(page.locator('tbody tr').first()).not.toContainText('待披露')
  await expect(page.locator('.issuance-panel').first().getByText(/共 1,?\d{3} 条 · 第 1\//)).toBeVisible()
  await page.getByRole('button', { name: '下一页' }).first().click()
  await expect(page.locator('.issuance-panel').first().getByText(/第 2\//)).toBeVisible()
  await expect(page.locator('tbody .rank-number').first()).toHaveText('21')
})

test('keeps the requested top-level workspace order', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.workspace-nav button').allTextContents()).resolves.toEqual([
    '发行洞察', '信号雷达', '主题研判', '基金产品库',
  ])
})

test('summary cards navigate to the matching issuance details', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: '查看近一周成立明细' }).click()
  await expect(page).toHaveURL(/#established-week$/)
  await expect(page.getByRole('tab', { name: '近一周' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: '查看认购中明细' }).click()
  await expect(page).toHaveURL(/#ongoing-offerings$/)
  await expect(page.getByRole('heading', { name: '当前认购中' })).toBeInViewport()

  await page.getByRole('button', { name: '查看当前暂停申购明细' }).click()
  await expect(page).toHaveURL(/#purchase-suspensions$/)
  await expect(page.getByRole('heading', { name: '暂停申购追踪' })).toBeInViewport()
})
