import { chromium } from '@playwright/test'

const baseURL = process.env.PRODUCTION_URL
const expectedDate = process.env.EXPECTED_DATE
if (!baseURL || !expectedDate) throw new Error('PRODUCTION_URL and EXPECTED_DATE are required')

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${baseURL}?verify=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 })

  await page.getByRole('heading', { name: '核心预研产品池' }).waitFor()
  await page.locator('.research-data-date').getByText(expectedDate).waitFor()
  const brief = page.getByRole('region', { name: '前瞻产品方向简报' })
  await brief.waitFor()
  await page.getByRole('button', { name: '未来3个月' }).click()
  await brief.getByText('短期催化').first().waitFor()
  await page.getByRole('button', { name: '未来半年' }).click()
  await brief.getByText('产业兑现').first().waitFor()
  await page.getByRole('button', { name: '未来1年' }).click()
  await brief.getByText('赛道形成').first().waitFor()
  await page.getByText('母池36个方向全部展示').waitFor()
  if (await page.locator('.attention-dot').count() !== 36) throw new Error('attention heatmap did not render all 36 verified themes')
  if (await page.locator('.attention-dot.is-core').count() !== 10) throw new Error('attention heatmap did not render exactly 10 core themes')
  await page.getByRole('heading', { name: '产品方向可行性' }).waitFor()
  await page.getByRole('heading', { name: '产品空位判断' }).waitFor()

  await page.getByRole('button', { name: '市场分析' }).click()
  await page.getByRole('heading', { name: '全市场公募基金摘要' }).waitFor()
  await page.getByText(`统计截止：${expectedDate}`).waitFor()
  await page.getByText(`数据日期：${expectedDate}`).waitFor()

  await page.getByRole('button', { name: '行情预测' }).click()
  await page.getByRole('heading', { name: '行情预测' }).waitFor()
  await page.getByText(`数据日期 ${expectedDate}`).waitFor()
  await page.getByLabel('基准判断动态信号').waitFor()

  await page.getByRole('button', { name: '发行洞察' }).click()
  await page.getByRole('heading', { name: '发行洞察' }).waitFor()
  await page.getByRole('tabpanel').getByText(`数据日期：${expectedDate}`).waitFor()

  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`)
  console.log(`Production UI verified for all four workspaces at ${expectedDate}`)
} finally {
  await browser.close()
}
