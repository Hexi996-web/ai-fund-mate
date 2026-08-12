export const THEME_NAMES = { gold: '黄金', ai_semiconductor: 'AI与半导体', dividend: '红利', bond: '债券', hong_kong_tech: '港股科技' }
export const EVIDENCE_NAMES = { policy: '政策', funds: '资金', fundamental: '基本面', valuation: '估值', product_supply: '产品供给' }
export const mergeThemeWorkspace = (scores, scenarios) => {
  const scenarioMap = new Map((scenarios?.themes ?? []).map((item) => [item.theme, item]))
  return (scores?.themes ?? []).map((item) => {
    const scenario = scenarioMap.get(item.theme) ?? {}
    return { ...item, name: THEME_NAMES[item.theme] ?? item.theme, scenarioStatus: scenario.status ?? 'unavailable', scenarios: scenario.scenarios ?? [], availablePoints: scenario.availablePoints ?? 0, requiredPoints: scenario.requiredPoints ?? 5 }
  })
}
export const fetchThemeWorkspace = async (fetchImpl = fetch) => {
  const [scoresResponse, scenariosResponse] = await Promise.all([fetchImpl('/data/five-themes/scores.json'), fetchImpl('/data/five-themes/scenarios.json')])
  if (!scoresResponse.ok || !scenariosResponse.ok) throw new Error('主题研究数据暂时不可用')
  return mergeThemeWorkspace(await scoresResponse.json(), await scenariosResponse.json())
}
