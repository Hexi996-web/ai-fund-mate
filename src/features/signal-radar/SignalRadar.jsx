import { useMemo, useRef, useState } from 'react'
import { MARKET_REGIME, OPPORTUNITY_THEMES, SIGNALS } from './signalData.js'
import { filterSignals, getSignalSummary, sortSignals } from './signalModel.js'
import { readWatchlist, toggleWatchlist } from './watchlist.js'
import { SignalSummary } from './SignalSummary.jsx'
import { SignalFilters } from './SignalFilters.jsx'
import { SignalFeed } from './SignalFeed.jsx'
import { OpportunityThemes } from './OpportunityThemes.jsx'
import { SignalDrawer } from './SignalDrawer.jsx'
import './signalRadar.css'

const initialFilters = { category: 'all', importance: 'all', evidenceType: 'all' }

export function SignalRadar() {
  const [filters, setFilters] = useState(initialFilters)
  const [selectedId, setSelectedId] = useState(null)
  const [watchlistIds, setWatchlistIds] = useState(() => typeof window === 'undefined' ? [] : readWatchlist(window.localStorage))
  const returnFocusRef = useRef(null)
  const visibleSignals = useMemo(() => sortSignals(filterSignals(SIGNALS, filters)), [filters])
  const summary = useMemo(() => getSignalSummary(SIGNALS, new Date('2026-08-13T12:00:00+08:00')), [])
  const selectedSignal = SIGNALS.find(({ id }) => id === selectedId) ?? null
  const openSignal = (id, trigger) => { if (!id) return; returnFocusRef.current = trigger; setSelectedId(id) }

  return (
    <main className="radar-content">
      <SignalSummary summary={summary} regime={MARKET_REGIME} />
      <SignalFilters filters={filters} onChange={setFilters} />
      <div className="radar-workspace">
        <SignalFeed signals={visibleSignals} onOpenSignal={openSignal} />
        <OpportunityThemes themes={OPPORTUNITY_THEMES} signals={SIGNALS} onOpenSignal={openSignal} />
      </div>
      <SignalDrawer signal={selectedSignal} isWatched={selectedSignal ? watchlistIds.includes(selectedSignal.id) : false} returnFocusRef={returnFocusRef} onClose={() => setSelectedId(null)} onToggleWatch={() => setWatchlistIds(toggleWatchlist(window.localStorage, watchlistIds, selectedSignal.id))} />
    </main>
  )
}
