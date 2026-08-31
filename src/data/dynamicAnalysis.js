import { useEffect, useMemo, useState } from 'react'

export const ANALYSIS_SETTINGS_EVENT = 'ai-fund-mate-analysis-settings'
export const ANALYSIS_SETTINGS_KEY = 'ai-fund-mate-analysis-session-v1'

export function getSessionAnalysisSettings() {
  try { return JSON.parse(sessionStorage.getItem(ANALYSIS_SETTINGS_KEY)) || {} } catch { return {} }
}

export function useDynamicAnalysis({ analysisKey, dataDate, facts, fallback }) {
  const serialized = useMemo(() => JSON.stringify({ analysisKey, dataDate, facts, fallback }), [analysisKey, dataDate, facts, fallback])
  const [state, setState] = useState({ report: fallback, source: 'rule-fallback', loading: true })
  const [settingsVersion, setSettingsVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setSettingsVersion((value) => value + 1)
    window.addEventListener(ANALYSIS_SETTINGS_EVENT, refresh)
    return () => window.removeEventListener(ANALYSIS_SETTINGS_EVENT, refresh)
  }, [])
  useEffect(() => {
    if (!dataDate || dataDate === '—') return undefined
    const controller = new AbortController()
    setState({ report: fallback, source: 'rule-fallback', loading: true })
    const settings = getSessionAnalysisSettings()
    const headers = { 'Content-Type': 'application/json' }
    if (settings.apiKey && settings.model && settings.baseUrl) {
      headers['X-Analysis-Api-Key'] = settings.apiKey
      headers['X-Analysis-Model'] = settings.model
      headers['X-Analysis-Base-Url'] = settings.baseUrl
    }
    fetch('/api/analysis/report', { method: 'POST', headers, body: serialized, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP_${response.status}`)))
      .then((result) => setState({ ...result, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ report: fallback, source: 'rule-fallback', loading: false, degraded: true }) })
    return () => controller.abort()
  }, [serialized, dataDate, settingsVersion])
  return state
}
