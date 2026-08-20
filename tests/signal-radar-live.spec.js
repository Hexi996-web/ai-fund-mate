import { expect, test } from '@playwright/test'

const signals = Array.from({ length: 35 }, (_, index) => ({
  id: `live-${index + 1}`, clusterId: `cluster-${index + 1}`,
  category: index % 4 === 0 ? 'customer' : index % 3 === 0 ? 'macro' : 'policy',
  title: `可追溯公开信号 ${index + 1}`, summary: '来自官方免费公开信息。', priority: 90 - index,
  sourceConfidence: .92, customerDemandScore: index % 4 === 0 ? 1 : .4,
  demandKind: index % 4 === 0 ? 'direct' : 'unknown', validationStatus: 'confirmed',
  publishedAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z',
  sources: [{ url: `https://example.com/source/${index + 1}`, excerpt: '官方公开文件', confidence: .92 }],
}))

const snapshot = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  health: { status: 'healthy', backend: 'postgresql', lastSuccessfulUpdate: new Date().toISOString(), fresh: true, signalCount: 35, catalystCount: 1, rawItemCount: 40 },
  regime: { status: 'neutral', label: '中性', rationale: [] }, signals,
  themes: [{ id: 'policy', title: '政策主题', signalIds: ['live-1'] }],
  catalysts: [{ id: 'event-1', signalId: 'live-1', title: '政策发布窗口', scheduledAt: '2026-08-20T00:00:00Z', priority: 80, description: '验证政策落地。', validationStatus: 'confirmed' }],
  dailyBrief: { id: 'brief-1', windowStart: '2026-08-13T00:00:00Z', windowEnd: '2026-08-14T00:00:00Z', generatedAt: '2026-08-14T00:01:00Z', body: '重点跟踪政策与客需共振。', status: 'published', signalIds: ['live-1'], topCall: '优先验证真实客户需求' },
}

test('does not expose the raw signal feed', async ({ page }) => {
  await page.route('**/data/signal-radar.json', (route) => route.fulfill({ json: snapshot }))
  await page.goto('/')
  await page.getByRole('button', { name: '行情预测' }).click()
  await expect(page.locator('[data-signal-id]')).toHaveCount(0)
})
