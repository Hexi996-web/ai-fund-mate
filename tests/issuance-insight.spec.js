import { expect, test } from '@playwright/test'

test('shows issuance rankings and current purchase suspensions on the home workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '发行洞察', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: '基金发行市场洞察' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '发行成功榜' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '发行后规模追踪' })).toBeVisible()
  await expect(page.getByLabel('历史覆盖与有效可比四象限')).toContainText('有历史×有效可比')
  await expect(page.getByText('增长规律分析')).toBeVisible()
  const growthSection = page.locator('#post-launch-scale')
  await expect(growthSection.getByRole('tab', { name: '基金公司' })).toBeVisible()
  await growthSection.getByRole('tab', { name: '基金公司' }).click()
  await expect(growthSection.locator('.growth-dimension-summary')).toContainText('有效可比产品')
  const firstCompanyCard = growthSection.locator('.growth-patterns article').first()
  await firstCompanyCard.getByRole('button', { name: /查看全部\d+个样本/ }).click()
  await expect(page.locator('.growth-sample-detail')).toBeVisible()
  await expect(page.locator('.growth-sample-detail tbody tr')).not.toHaveCount(0)
  await expect(page.locator('.growth-sample-detail .median-sample')).not.toHaveCount(0)
  await expect(page.getByLabel('规模增长排序')).toHaveValue('scaleGrowthPercent')
  await expect(page.getByRole('heading', { name: '暂停申购结构分析' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '未来发行趋势' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '今年异常退出跟踪' })).toHaveCount(0)
  await expect(page.locator('#purchase-suspensions').getByText(/当前公开快照仅提供暂停申购状态/)).toBeVisible()
  await expect(page.locator('#purchase-suspensions').getByRole('tab', { name: '规模区间' })).toBeVisible()
  await page.getByRole('tab', { name: '今年以来' }).click()
  await page.getByText(/展开当前窗口明细/).click()
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
    '发行洞察', '板块机会', '基金产品库',
  ])
})

test('summary cards navigate to the matching issuance details', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: '查看近一周成立明细' }).click()
  await expect(page).toHaveURL(/#established-week$/)
  await expect(page.getByRole('tab', { name: '近一周' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: '查看认购中明细' }).click()
  await expect(page).toHaveURL(/#ongoing-offerings$/)
  await expect(page.locator('#ongoing-offerings')).toBeInViewport()

  await page.getByRole('button', { name: '查看待发行预告明细' }).click()
  await expect(page).toHaveURL(/#upcoming-offerings$/)
  await expect(page.getByText(/待发行预告 · \d+只产品/)).toBeInViewport()

  await page.getByRole('button', { name: '查看当前暂停申购明细' }).click()
  await expect(page).toHaveURL(/#purchase-suspensions$/)
  await expect(page.getByRole('heading', { name: '暂停申购结构分析' })).toBeInViewport()
})
