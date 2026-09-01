import { expect, test } from '@playwright/test'

const shares = [
  { code: '000001', name: '示例成长基金A', type: '股票型', shareClass: 'A', netValue: 1.2, dailyChangePercent: 1.5, lastNetValueDate: '2026-08-12', purchaseStatus: '开放申购', redemptionStatus: '开放赎回', operationStatus: 'active', groupingConfidence: 'high', groupingRule: 'explicit_share_suffix' },
  { code: '000002', name: '示例成长基金C', type: '股票型', shareClass: 'C', netValue: 1.1, dailyChangePercent: 1.4, lastNetValueDate: '2026-08-12', purchaseStatus: '开放申购', redemptionStatus: '开放赎回', operationStatus: 'active', groupingConfidence: 'high', groupingRule: 'explicit_share_suffix' },
]

const productPayload = {
  dataDate: '2026-08-12',
  updateTime: '2026-08-13 19:00:00',
  productTotal: 1,
  shareTotal: 2,
  groupingVersion: 'v1',
  products: [{ productId: 'prd_1234567890abcdef', productName: '示例成长基金', type: '股票型', representativeCode: '000001', shareCount: 2, groupingConfidence: 'high', shares, establishedDate: '2025-01-01', currentScaleYi: 12, baselineScaleYi: 10, baselineScaleType: '去年年末规模', scaleNetIncreaseYi: 2, scaleGrowthPercent: 20, navGrowthPercent: 15, maxDrawdownPercent: -8, metricsCoverage: '全年' }],
}

const openLibrary = async (page) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: '公募基金简报', exact: true }).click()
  await page.locator('.result-count').waitFor()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/fund_products.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(productPayload) }))
})

test('defaults to products and expands all share classes accessibly', async ({ page }) => {
  await openLibrary(page)
  await expect(page.locator('.meta-row')).toContainText('基金产品 1 只')
  await expect(page.locator('.meta-row')).toContainText('基金份额 2 个')
  await expect(page.locator('.daily-product-summary')).toContainText('市场现状：')
  await expect(page.locator('.fund-product-table tbody > tr').first()).toContainText('示例成长基金')
  const toggle = page.locator('.fund-product-table .share-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.fund-share-row')).toHaveCount(2)
})

test('searching a C share code opens its product and highlights that share', async ({ page }) => {
  await openLibrary(page)
  await page.getByPlaceholder(/搜索基金/).fill('000002')
  await expect(page.locator('.fund-share-row[data-search-match="true"]')).toContainText('000002')
  await expect(page.locator('.fund-product-table')).toContainText('示例成长基金')
})

test('summary category links filter the top-30 database', async ({ page }) => {
  await openLibrary(page)
  await page.locator('.daily-product-summary').getByRole('button', { name: /股票型基金1只/ }).first().click()
  await expect(page.getByRole('button', { name: '股票型', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.result-count')).toContainText('仅展示前30支产品')
})

test('the all-funds view clears every active search and category filter', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('button', { name: '股票型', exact: true }).click()
  await page.getByPlaceholder(/搜索基金/).fill('000002')
  await expect(page.locator('.active-scope')).toContainText('分类：股票型')
  await expect(page.locator('.active-scope')).toContainText('搜索：000002')
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect(page.getByPlaceholder(/搜索基金/)).toHaveValue('')
  await expect(page.locator('.active-scope')).toHaveText('当前范围：全部公募基金')
})

test('the product list remains within the mobile viewport', async ({ page }) => {
  await openLibrary(page)
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
})
