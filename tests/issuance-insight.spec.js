import { expect, test } from '@playwright/test'

const makeProduct = (code, name, type, establishedDate, scale) => ({
  productId: `prd_${code}`, productName: name, type, representativeCode: code,
  shareCount: 1, groupingConfidence: 'high', establishedDate,
  currentScaleYi: scale, scaleNetIncreaseYi: scale - 1, scaleGrowthPercent: scale * 2,
  navGrowthPercent: scale / 2, maxDrawdownPercent: -scale / 3,
  shares: [{ code, name, type, netValue: 1, dailyChangePercent: 0, lastNetValueDate: '2026-08-20', purchaseStatus: '开放申购', redemptionStatus: '开放赎回', operationStatus: 'active', establishedDate, shareClass: 'DEFAULT' }],
})

const products = [
  makeProduct('000001', '八月成立股票', '股票型', '2026-08-01', 10),
  makeProduct('000002', '六月成立债券', '债券型-长债', '2026-06-01', 30),
  makeProduct('000003', '二月成立混合', '混合型-偏股', '2026-02-01', 20),
  makeProduct('000004', '上年成立指数', '指数型-股票', '2025-12-31', 40),
]

test.beforeEach(async ({ page }) => {
  await page.route('**/fund_products.json', (route) => route.fulfill({ json: {
    updateTime: '2026-08-20 06:00:00', dataDate: '2026-08-20',
    productTotal: products.length, shareTotal: products.length, products,
  } }))
})

test('shows only newly established funds in quarter and year-to-date databases', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '发行洞察', exact: true }).click()
  await expect(page.getByRole('button', { name: '发行洞察', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: '发行洞察' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /近三个月/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.meta-row')).toContainText('基金产品 2 只')
  await expect(page.locator('.active-scope')).toContainText('2026-05-20—2026-08-20')
  await expect(page.locator('.fund-product-table tbody > tr:not(.fund-product-share-detail)')).toHaveCount(2)
  await expect(page.locator('body')).not.toContainText('上年成立指数')

  await page.getByRole('tab', { name: /本年至今/ }).click()
  await expect(page.locator('.meta-row')).toContainText('基金产品 3 只')
  await expect(page.locator('.active-scope')).toContainText('2026-01-01—2026-08-20')
  await expect(page.locator('body')).toContainText('二月成立混合')
  await expect(page.locator('body')).not.toContainText('上年成立指数')
})

test('reuses market-analysis categories, five sorts, and current-scale default', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '发行洞察', exact: true }).click()
  const sort = page.getByLabel('基金排序方式')
  await expect(sort).toHaveValue('scale-desc')
  expect(await sort.locator('option').evaluateAll((options) => options.map((option) => option.value))).toEqual([
    'scale-desc', 'scale-net-desc', 'scale-growth-desc', 'nav-growth-desc', 'drawdown-desc',
  ])
  await expect(page.locator('.fund-product-table tbody > tr').first()).toContainText('六月成立债券')
  await page.getByRole('button', { name: '股票型', exact: true }).click()
  await expect(page.locator('.result-count')).toContainText('当前匹配 1 只基金产品')
})

test('keeps the requested top-level workspace order', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.workspace-nav button').allTextContents()).resolves.toEqual([
    '预研产品池', '市场分析', '发行洞察', '行情预测',
  ])
})
