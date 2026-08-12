import { joinThemeFunds } from './themeFunds.js'

export const THEME_NAMES = { gold: '黄金', ai_semiconductor: 'AI与半导体', dividend: '红利基金', bond: '债券基金', hong_kong_tech: '港股科技' }
export const EVIDENCE_NAMES = { policy: '政策', funds: '资金', fundamental: '基本面', valuation: '估值', product_supply: '产品供给' }
export const mergeThemeWorkspace = (scores, scenarios, fundGroups = new Map(), fundUnavailableReason = null) => {
  const scenarioMap = new Map((scenarios?.themes ?? []).map((item) => [item.theme, item]))
  return (scores?.themes ?? []).map((item) => {
    const scenario = scenarioMap.get(item.theme) ?? {}
    const relatedFunds = fundGroups.get(item.theme) ?? { featured: [], all: [], unavailableReason: fundUnavailableReason }
    return { ...item, name: THEME_NAMES[item.theme] ?? item.theme, scenarioStatus: scenario.status ?? 'unavailable', scenarios: scenario.scenarios ?? [], availablePoints: scenario.availablePoints ?? 0, requiredPoints: scenario.requiredPoints ?? 5, relatedFunds }
  })
}
export const fetchThemeWorkspace = async (fetchImpl = fetch) => {
  const results = await Promise.allSettled([
    fetchImpl('/data/five-themes/scores.json'),
    fetchImpl('/data/five-themes/scenarios.json'),
    fetchImpl('/data/five-themes/fund-links.json'),
    fetchImpl('/funds_active.json'),
  ])
  const [scoresResult, scenariosResult, linksResult, fundsResult] = results
  if (scoresResult.status !== 'fulfilled' || scenariosResult.status !== 'fulfilled' || !scoresResult.value.ok || !scenariosResult.value.ok) throw new Error('主题研究数据暂时不可用')
  const scores = await scoresResult.value.json()
  const scenarios = await scenariosResult.value.json()
  let groups = new Map()
  let unavailableReason = null
  if (linksResult.status !== 'fulfilled' || fundsResult.status !== 'fulfilled' || !linksResult.value.ok || !fundsResult.value.ok) {
    unavailableReason = '主题基金映射暂不可用'
  } else {
    groups = joinThemeFunds(await linksResult.value.json(), await fundsResult.value.json())
  }
  return mergeThemeWorkspace(scores, scenarios, groups, unavailableReason)
}