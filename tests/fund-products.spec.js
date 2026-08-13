import { expect, test } from '@playwright/test'

const shares = [
  { code: '000001', name: '示例成长基金A', type: '股票型', shareClass: 'A', netValue: 1.2, dailyChangePercent: 1.5, lastNetValueDate: '2026-08-12', purchaseStatus: '开放申购', redemptionStatus: '开放赎回', operationStatus: 'active', groupingConfidence: 'high', groupingRule: 'explicit_share_suffix' },
  { code: '000002', name: '示例成长基金C', type: '股票型', shareClass: 'C', netValue: 1.1, dailyChangePercent: 1.4, lastNetValueDate: '2026-08-12', purchaseStatus: '开放申购', redemptionStatus: '开放赎回', operationStatus: 'active', groupingConfidence: 'high', groupingRule: 'explicit_share_suffix' },
]

const productPayload = {
  updateTime: '2026-08-13 19:00:00',
  productTotal: 1,
  shareTotal: 2,
  groupingVersion: 'v1',
  products: [{ productId: 'prd_1234567890abcdef', productName: '示例成长基金', type: '股票型', representativeCode: '000001', shareCount: 2, groupingConfidence: 'high', shares }],
}

const openLibrary = async (page) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: '基金产品库', exact: true }).click()
  await page.locator('.result-count').waitFor()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/fund_products.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(productPayload) }))
})

test('defaults to products and expands all share classes accessibly', async ({ page }) => {
  await openLibrary(page)
  await expect(page.locator('.meta-row')).toContainText('基金产品 1 只')
  await expect(page.locator('.meta-row')).toContainText('基金份额 2 个')
  await expect(page.locator('.fund-product-card')).toHaveCount(1)
  await expect(page.locator('.fund-product-card')).toContainText('代表份额：A类（000001）')
  const toggle = page.locator('.fund-product-card .share-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.fund-share-row')).toHaveCount(2)
})

test('searching a C share code opens its product and highlights that share', async ({ page }) => {
  await openLibrary(page)
  await page.getByPlaceholder(/搜索基金/).fill('000002')
  await expect(page.locator('.fund-share-row[data-search-match="true"]')).toContainText('000002')
  await expect(page.locator('.fund-product-card')).toHaveCount(1)
})

test('product cards remain within the mobile viewport', async ({ page }) => {
  await openLibrary(page)
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
})
