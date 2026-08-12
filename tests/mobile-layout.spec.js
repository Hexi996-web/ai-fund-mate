import { expect, test } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

const completeFund = (code, name, type, overrides = {}) => ({
  code,
  name,
  type,
  netValue: 1,
  dailyChangePercent: 0,
  lastNetValueDate: '2026-08-11',
  purchaseStatus: '开放申购',
  redemptionStatus: '开放赎回',
  operationStatus: 'active_snapshot',
  ...overrides,
})

const activeFunds = [
  completeFund('000101', '消费先锋股票A', '股票型', { netValue: 1.1, dailyChangePercent: 1.2, lastNetValueDate: '2026-08-10' }),
  completeFund('000102', '消费成长指数B', '指数型-股票', { netValue: 2.2, dailyChangePercent: 3.4 }),
  completeFund('000103', '医疗创新股票C', '股票型', { netValue: 0.9, dailyChangePercent: -0.5, purchaseStatus: '暂停申购' }),
  completeFund('000201', '稳健配置混合', '混合型', { netValue: 1.3, dailyChangePercent: 0.4 }),
  completeFund('000301', '安心收益债券', '债券型', { netValue: 1.05, dailyChangePercent: 0.1 }),
  completeFund('000401', '现金管理货币', '货币型'),
  completeFund('000501', '养老目标FOF', '基金中基金', { netValue: 1.4, dailyChangePercent: 0.8, lastNetValueDate: '2026-08-10' }),
  completeFund('000601', '另类策略基金', '商品型', {
    netValue: null,
    dailyChangePercent: null,
    lastNetValueDate: null,
    purchaseStatus: null,
    redemptionStatus: null,
  }),
]

const clearStorage = async (page) => {
  await page.goto('/')
  await page.locator('.result-count').waitFor({ state: 'visible' })
  await page.evaluate(() => window.localStorage.clear())
}

const routeActiveFunds = async (page) => {
  await page.route('**/funds_active.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ updateTime: '2026-08-10 14:13:11', funds: activeFunds }),
  }))
}

const collectConsoleProblems = (page) => {
  const problems = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(message.type() + ': ' + message.text())
    }
  })
  page.on('pageerror', (error) => problems.push('pageerror: ' + error.message))
  return problems
}

test('mobile fund flow stays compact and persists the selected view', async ({ page }) => {
  await routeActiveFunds(page)
  const consoleProblems = collectConsoleProblems(page)
  await clearStorage(page)

  await page.reload()
  await expect(page).toHaveTitle('AI虚拟产品经理')
  await expect(page.locator('.meta-row').first()).toContainText('数据日期：2026-08-10')
  await expect(page.locator('.fund-card')).toHaveCount(activeFunds.length)
  await expect(page.locator('vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '卡片', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const geometry = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.category-filter')]
    const categories = document.querySelector('.category-filters').getBoundingClientRect()
    const toolbar = document.querySelector('.fund-toolbar').getBoundingClientRect()
    const rowTops = [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))]
      .sort((left, right) => left - right)
    const buttonHeight = buttons[0].getBoundingClientRect().height
    return {
      categoryHeight: categories.height,
      categoryToToolbarGap: toolbar.top - categories.bottom,
      rowCount: rowTops.length,
      rowGap: rowTops[1] - rowTops[0] - buttonHeight,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }
  })

  expect(geometry.rowCount).toBe(2)
  expect(geometry.categoryHeight).toBeLessThan(130)
  expect(geometry.rowGap).toBeGreaterThanOrEqual(0)
  expect(geometry.rowGap).toBeLessThanOrEqual(16)
  expect(geometry.categoryToToolbarGap).toBeGreaterThanOrEqual(0)
  expect(geometry.categoryToToolbarGap).toBeLessThanOrEqual(32)
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth)

  await page.getByRole('button', { name: '股票型', exact: true }).click()
  await page.getByPlaceholder('搜索基金名称或代码').fill('消费')
  await expect(page.locator('.result-count')).toHaveText('当前显示 2 只基金份额')
  await page.getByLabel('基金排序方式').selectOption('change-desc')
  await expect(page.locator('.fund-card h2')).toHaveText(['消费成长指数B', '消费先锋股票A'])

  await page.getByRole('button', { name: '列表', exact: true }).click()
  await expect(page.locator('.fund-table')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '列表', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '股票型', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('基金排序方式')).toHaveValue('change-desc')
  await expect(page.locator('.fund-table tbody tr th[scope="row"]')).toHaveText([
    '消费成长指数B',
    '消费先锋股票A',
    '医疗创新股票C',
  ])

  await page.getByRole('button', { name: '卡片', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '卡片', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.fund-card')).toHaveCount(3)

  await page.getByPlaceholder('搜索基金名称或代码').fill('不存在的基金XYZ')
  await expect(page.getByRole('heading', { name: '没有匹配结果' })).toBeVisible()
  await page.getByRole('button', { name: '重置条件' }).click()
  await expect(page.getByPlaceholder('搜索基金名称或代码')).toHaveValue('')
  await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const finalWidths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(finalWidths.document).toBeLessThanOrEqual(finalWidths.viewport)
  expect(finalWidths.body).toBeLessThanOrEqual(finalWidths.viewport)
  expect(consoleProblems).toEqual([])

  await page.screenshot({ path: path.join(os.tmpdir(), 'ai-fund-mate-mobile-e2e-green.png') })
})

const sortCases = [
  ['default', ['000101', '000102', '000103', '000201', '000301', '000401', '000501', '000601']],
  ['change-desc', ['000102', '000101', '000501', '000201', '000301', '000401', '000103', '000601']],
  ['change-asc', ['000103', '000401', '000301', '000201', '000501', '000101', '000102', '000601']],
  ['nav-desc', ['000102', '000501', '000201', '000101', '000301', '000401', '000103', '000601']],
  ['nav-asc', ['000103', '000401', '000301', '000101', '000201', '000501', '000102', '000601']],
  ['date-desc', ['000102', '000103', '000201', '000301', '000401', '000101', '000501', '000601']],
  ['date-asc', ['000101', '000501', '000102', '000103', '000201', '000301', '000401', '000601']],
  ['code-desc', ['000601', '000501', '000401', '000301', '000201', '000103', '000102', '000101']],
  ['code-asc', ['000101', '000102', '000103', '000201', '000301', '000401', '000501', '000601']],
]

test('every sort direction orders real fields semantically and keeps null values last', async ({ page }) => {
  await routeActiveFunds(page)
  await clearStorage(page)
  await page.reload()

  const renderedCodes = page.locator('.fund-card__heading > span')
  for (const [mode, expectedCodes] of sortCases) {
    await page.getByLabel('基金排序方式').selectOption(mode)
    await expect(renderedCodes).toHaveText(expectedCodes)
  }
})
test('snapshot data date is truthful and date sorting disappears when all real dates are missing', async ({ page }) => {
  const noDateFunds = activeFunds.slice(0, 2).map((fund) => ({ ...fund, lastNetValueDate: null }))
  await page.route('**/funds_active.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ update_time: '2026-08-07T18:30:00+08:00', funds: noDateFunds }),
  }))

  await clearStorage(page)
  await page.evaluate(() => window.localStorage.setItem(
    'ai-fund-mate:preference:sortMode',
    JSON.stringify('date-desc'),
  ))
  await page.reload()

  await expect(page.locator('.meta-row').first()).toContainText('数据日期：2026-08-07')
  await expect(page.getByLabel('基金排序方式')).toHaveValue('default')
  await expect(page.getByLabel('基金排序方式').locator('option[value="date-desc"]')).toHaveCount(0)
  await expect(page.getByLabel('基金排序方式').locator('option[value="date-asc"]')).toHaveCount(0)
})
test('fallback source warns and renders unavailable real fields explicitly', async ({ page }) => {
  const consoleProblems = collectConsoleProblems(page)
  await page.route('**/funds_active.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ funds: [] }),
  }))
  await page.route('**/funds_excluded.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      updateTime: '2026-08-06 14:00:00',
      total: 1,
      funds: [{
        code: '654321',
        name: '已隔离重叠基金',
        operationStatus: 'suspected_terminated',
        lastNetValueDate: null,
        exclusionReason: '超过60天无净值',
      }],
    }),
  }))
  await page.route('**/funds_simple.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      update_time: '2026-08-06T15:00:00+08:00',
      funds: [
        { code: '654321', name: '不应回流的隔离基金', type: '混合型' },
        { code: '123456', name: '降级消费股票', type: '股票型' },
      ],
    }),
  }))

  await clearStorage(page)
  await page.reload()
  await expect(page.locator('.meta-row').first()).toContainText('数据日期：2026-08-06')
  await expect(page.locator('.fund-card')).toHaveCount(1)
  await expect(page.locator('.fund-card__heading > span')).toHaveText('123456')
  await expect(page.locator('.cache-warning')).toHaveText('当前为降级数据源，可能仅提供代码、名称和类型。')
  await expect(page.locator('.fund-card').first().locator('dd')).toHaveText([
    '股票型',
    '--',
    '--',
    '--',
    '--',
    '--',
    '--',
  ])
  expect(consoleProblems).toEqual([])
})
