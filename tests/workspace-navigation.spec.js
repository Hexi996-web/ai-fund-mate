import { test, expect } from '@playwright/test'

test('merges signals and themes and preserves the fund query across workspace switches', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '预研产品池', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '公募基金简报', exact: true }).click()
  await expect(page.getByRole('button', { name: '公募基金简报', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await expect(page.getByRole('heading', { name: '行情预测', exact: true })).toBeVisible()
  await expect(page.getByText('五主题研判', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '公募基金简报', exact: true }).click()
  const search = page.getByPlaceholder('搜索基金名称或代码')
  await expect(search).toBeVisible()
  await search.fill('000001')
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await page.getByRole('button', { name: '公募基金简报', exact: true }).click()
  await expect(search).toHaveValue('000001')
})

test('loads the compact forecast and sends only summarized model facts', async ({ page }) => {
  let requestBytes = 0
  await page.route('**/api/analysis/report', async (route) => {
    requestBytes = Buffer.byteLength(route.request().postData() || '')
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test fallback"}' })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '行情预测', exact: true }).click()
  await expect(page.getByLabel('基准判断动态信号')).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => requestBytes).toBeGreaterThan(0)
  expect(requestBytes).toBeLessThan(48_000)
})
