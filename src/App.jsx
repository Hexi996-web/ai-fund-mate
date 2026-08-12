import { useEffect, useMemo, useState } from 'react'
import avatarUrl from './assets/fund-mate-avatar.png'
import { FundControls, FUND_CATEGORIES, SORT_OPTIONS } from './components/FundControls.jsx'
import { FundCards, FundTable, SkeletonView } from './components/FundViews.jsx'
import {
  readFundCache,
  readPreference,
  readStaleFundCache,
  writeFundCache,
  writePreference,
} from './data/fundCache.js'
import { fetchFundPayload, getPayloadDataDate } from './data/fundData.js'
import { normalizeFunds, selectFunds } from './data/fundModel.js'
import { selectDisplayFunds } from './data/fundDisplay.js'
import './App.css'

const MOBILE_VIEW_QUERY = '(max-width: 767px)'
const AMAC_REFERENCE_URL = 'https://www.amac.org.cn/sjtj/tjbg/gmjj/202606/P020260617606470583907.pdf'
const SORT_MODES = new Set(SORT_OPTIONS.map((option) => option.value))
const VIEW_MODES = new Set(['list', 'card'])

const getToday = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getStoredCategory = () => {
  if (typeof window === 'undefined') return '全部'
  const value = readPreference(window.localStorage, 'category', '全部')
  return FUND_CATEGORIES.includes(value) ? value : '全部'
}

const getStoredSortMode = () => {
  if (typeof window === 'undefined') return 'default'
  const value = readPreference(window.localStorage, 'sortMode', 'default')
  return SORT_MODES.has(value) ? value : 'default'
}

const getInitialViewMode = () => {
  if (typeof window === 'undefined') return 'list'
  const stored = readPreference(window.localStorage, 'viewMode', null)
  if (VIEW_MODES.has(stored)) return stored
  return window.matchMedia(MOBILE_VIEW_QUERY).matches ? 'card' : 'list'
}

const getAssistantMessage = ({ status, selectedCount, totalCount, query, category }) => {
  if (status === 'loading') return '你好，我是你的基金同事，正在整理今日数据...'
  if (status === 'error') return '今天的数据暂时没有整理好，请稍后再试。'
  if (selectedCount === 0) return '没有找到符合当前条件的基金份额，试试调整搜索或分类。'
  if (query && category !== '全部') {
    return `已在${category}中找到 ${selectedCount.toLocaleString('zh-CN')} 只与“${query}”匹配的基金份额。`
  }
  if (query) return `找到 ${selectedCount.toLocaleString('zh-CN')} 只与“${query}”匹配的基金份额。`
  if (category !== '全部') return `已筛选出 ${selectedCount.toLocaleString('zh-CN')} 只${category}基金份额。`
  return `已就绪，共收录 ${totalCount.toLocaleString('zh-CN')} 只基金份额，你可以按名称或代码搜索。`
}

function AssistantHeader({ status, message }) {
  return (
    <header className="assistant-header">
      <div className="header-inner">
        <div className="brand">
          <h1>AI虚拟产品经理</h1>
          <p>AI Fund Mate</p>
        </div>
        <div className="assistant-row">
          <div className="avatar-wrap" aria-hidden="true">
            <img src={avatarUrl} alt="" />
            <span className={status === 'loading' ? 'status-dot status-dot--loading' : 'status-dot'} />
          </div>
          <div className="speech-bubble" aria-live="polite">
            <p>{message}</p>
            {status === 'loading' ? (
              <span className="thinking-dots" aria-label="正在加载">
                <i /><i /><i />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}

function SourceDisclosure({ source, stale }) {
  return (
    <aside className="source-disclosure" aria-label="数据口径说明">
      <p>
        <a href={AMAC_REFERENCE_URL} target="_blank" rel="noreferrer">
          官方参考：截至 2026 年 5 月底境内公募基金 14,173 只（不含已报送清盘基金）
        </a>
        <span>基金主体数与页面基金份额数口径不同，不可直接比较。</span>
      </p>
      {source === 'fallback' ? <p className="cache-warning">当前为降级数据源，可能仅提供代码、名称和类型。</p> : null}
      {stale ? <p className="cache-warning">今日数据更新失败，当前展示最近一次有效缓存。</p> : null}
    </aside>
  )
}

function EmptyState({ onReset }) {
  return (
    <section className="empty-state">
      <h2>没有匹配结果</h2>
      <p>换一个基金名称、简称或六位代码，也可以调整基金分类。</p>
      <button type="button" onClick={onReset}>重置条件</button>
    </section>
  )
}

export default function App({ initialQuery = '', onQueryChange }) {
  const [funds, setFunds] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [dataDate, setDataDate] = useState('')
  const [source, setSource] = useState('')
  const [isStaleCache, setIsStaleCache] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(getStoredCategory)
  const [sortMode, setSortMode] = useState(getStoredSortMode)
  const [viewMode, setViewMode] = useState(getInitialViewMode)

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    onQueryChange?.(query)
  }, [onQueryChange, query])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    const today = getToday()
    const cached = readFundCache(window.localStorage, today)
    const staleCache = cached === null
      ? readStaleFundCache(window.localStorage, today)
      : null

    if (cached?.funds.length > 0) {
      setFunds(cached.funds)
      setDataDate(cached.dataDate)
      setSource(cached.source)
      setStatus('ready')
      return () => controller.abort()
    }

    const loadFunds = async () => {
      try {
        const { payload, source: nextSource } = await fetchFundPayload(fetch, { signal: controller.signal })
        const normalized = normalizeFunds(payload)
        const nextDataDate = getPayloadDataDate(payload)
        if (normalized.length === 0) throw new Error('接口未返回有效基金数据')

        setFunds(normalized)
        setDataDate(nextDataDate)
        setSource(nextSource)
        setStatus('ready')
        writeFundCache(window.localStorage, {
          date: today,
          dataDate: nextDataDate,
          fetchedAt: Date.now(),
          source: nextSource,
          funds: normalized,
        })
      } catch (requestError) {
        if (requestError?.name === 'AbortError') return
        if (staleCache?.funds.length > 0) {
          setFunds(staleCache.funds)
          setDataDate(staleCache.dataDate)
          setSource(staleCache.source)
          setIsStaleCache(true)
          setStatus('ready')
          return
        }
        setStatus('error')
        setError(requestError?.message || '数据加载失败，请稍后重试。')
      }
    }

    loadFunds()
    return () => controller.abort()
  }, [])

  const hasDateData = funds.some((fund) => fund.lastNetValueDate !== null)
  const effectiveSortMode = !hasDateData && sortMode.startsWith('date-') ? 'default' : sortMode

  const selectedFunds = useMemo(() => selectFunds(funds, {
    query: debouncedQuery,
    category: selectedCategory,
    sortMode: effectiveSortMode,
  }), [debouncedQuery, effectiveSortMode, funds, selectedCategory])

  const displayFunds = useMemo(() => selectDisplayFunds(selectedFunds), [selectedFunds])

  const assistantMessage = getAssistantMessage({
    status,
    selectedCount: selectedFunds.length,
    totalCount: funds.length,
    query: debouncedQuery,
    category: selectedCategory,
  })

  const handleCategoryChange = (value) => {
    setSelectedCategory(value)
    writePreference(window.localStorage, 'category', value)
  }

  const handleSortModeChange = (value) => {
    setSortMode(value)
    writePreference(window.localStorage, 'sortMode', value)
  }

  const handleViewModeChange = (value) => {
    setViewMode(value)
    writePreference(window.localStorage, 'viewMode', value)
  }

  const resetConditions = () => {
    setQuery('')
    handleCategoryChange('全部')
  }

  return (
    <div className="app-shell">
      <AssistantHeader status={status} message={assistantMessage} />

      <main className="content">
        <div className="meta-row">
          <p>数据日期：<strong>{dataDate || '--'}</strong></p>
          {status === 'ready' ? <p>当前加载：<strong>{funds.length.toLocaleString('zh-CN')} 只基金份额</strong></p> : null}
        </div>

        <FundControls
          query={query}
          category={selectedCategory}
          sortMode={effectiveSortMode}
          hasDateData={hasDateData}
          viewMode={viewMode}
          onQueryChange={setQuery}
          onCategoryChange={handleCategoryChange}
          onSortModeChange={handleSortModeChange}
          onViewModeChange={handleViewModeChange}
          disabled={status === 'error'}
        />

        {status === 'loading' ? <SkeletonView viewMode={viewMode} /> : null}

        {status === 'error' ? (
          <section className="empty-state" role="alert">
            <h2>数据加载失败</h2>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>重新加载</button>
          </section>
        ) : null}

        {status === 'ready' ? <SourceDisclosure source={source} stale={isStaleCache} /> : null}

        {status === 'ready' && selectedFunds.length > 0 ? (
          <>
            <p className="result-count">
              当前显示 {selectedFunds.length.toLocaleString('zh-CN')} 只基金份额
            </p>
            {viewMode === 'card' ? <FundCards funds={displayFunds.items} /> : <FundTable funds={displayFunds.items} />}
          </>
        ) : null}

        {status === 'ready' && selectedFunds.length === 0 ? <EmptyState onReset={resetConditions} /> : null}
      </main>
    </div>
  )
}
