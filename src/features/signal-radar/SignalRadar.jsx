import { useEffect, useMemo, useRef, useState } from 'react'
import { MARKET_REGIME } from './signalData.js'
import { filterSignals, getSignalSummary, normalizeLiveSignal, sortSignals } from './signalModel.js'
import { fetchSignalSnapshot } from './signalApi.js'
import { readWatchlist, toggleWatchlist } from './watchlist.js'
import { SignalSummary } from './SignalSummary.jsx'
import { SignalFilters } from './SignalFilters.jsx'
import { SignalFeed } from './SignalFeed.jsx'
import { OpportunityThemes } from './OpportunityThemes.jsx'
import { SignalDrawer } from './SignalDrawer.jsx'
import { SignalHealth } from './SignalHealth.jsx'
import { DailyBrief } from './DailyBrief.jsx'
import { CatalystList } from './CatalystList.jsx'
import './signalRadar.css'

const initialFilters = { category: 'all', importance: 'all', evidenceType: 'all', demandKind: 'all' }
const PAGE_SIZE = 30

export function SignalRadar() {
  const [filters, setFilters] = useState(initialFilters)
  const [result, setResult] = useState({ state: 'loading', snapshot: null, error: null })
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [briefOpen, setBriefOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [watchlistIds, setWatchlistIds] = useState(() => typeof window === 'undefined' ? [] : readWatchlist(window.localStorage))
  const returnFocusRef = useRef(null)
  useEffect(() => { let active = true; fetchSignalSnapshot().then((next) => active && setResult(next)).catch((error) => active && setResult({ state: 'error', snapshot: null, error })); return () => { active = false } }, [])
  const signals = useMemo(() => (result.snapshot?.signals ?? []).map(normalizeLiveSignal), [result.snapshot])
  const filteredSignals = useMemo(() => sortSignals(filterSignals(signals, filters)), [filters, signals])
  const visibleSignals = filteredSignals.slice(0, visibleCount)
  const summary = useMemo(() => getSignalSummary(signals), [signals])
  const selectedSignal = signals.find(({ id }) => id === selectedId) ?? null
  const themes = useMemo(() => (result.snapshot?.themes ?? []).map((theme) => ({ ...theme, confidence: '待验证', action: '继续研究', counterSignalIds: [], invalidationCondition: '后续数据不支持。' })), [result.snapshot])
  const openSignal = (id, trigger) => { if (!id) return; returnFocusRef.current = trigger; setSelectedId(id) }

  return (
    <main className="radar-content">
      <SignalHealth {...result} />
      {result.snapshot ? <>
        <SignalSummary summary={summary} regime={result.snapshot.regime?.environment ?? MARKET_REGIME} />
        <DailyBrief brief={result.snapshot.dailyBrief} signals={signals} open={briefOpen} onToggle={() => setBriefOpen((value) => !value)} onOpenSignal={openSignal} />
        <SignalFilters filters={filters} onChange={(next) => { setFilters(next); setVisibleCount(PAGE_SIZE) }} />
        <div className="radar-workspace">
          <SignalFeed signals={visibleSignals} total={filteredSignals.length} hasMore={visibleCount < filteredSignals.length} onLoadMore={() => setVisibleCount((count) => count + PAGE_SIZE)} onOpenSignal={openSignal} />
          <div className="radar-sidebar"><CatalystList catalysts={result.snapshot.catalysts} onOpenSignal={openSignal} /><OpportunityThemes themes={themes} signals={signals} onOpenSignal={openSignal} /></div>
        </div>
      </> : null}
      <SignalDrawer signal={selectedSignal} isWatched={selectedSignal ? watchlistIds.includes(selectedSignal.id) : false} returnFocusRef={returnFocusRef} onClose={() => setSelectedId(null)} onToggleWatch={() => setWatchlistIds(toggleWatchlist(window.localStorage, watchlistIds, selectedSignal.id))} />
    </main>
  )
}
