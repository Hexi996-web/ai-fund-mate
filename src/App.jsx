import { useEffect, useMemo, useRef, useState } from 'react'
import { FundControls, SORT_OPTIONS } from './components/FundControls.jsx'
import { SkeletonView } from './components/FundViews.jsx'
import { FundProductTable } from './components/FundProductViews.jsx'
import { DailyProductSummary } from './components/DailyProductSummary.jsx'
import {
  readFundCache,
  readStaleFundCache,
  writeFundCache,
} from './data/fundCache.js'
import { fetchFundProductPayload, getPayloadDataDate } from './data/fundData.js'
import { DATA_STATUS_POLL_MS, fetchDataStatus } from './data/dataStatus.js'
import { fallbackProductsFromShares, normalizeProducts, selectProducts } from './data/fundProductModel.js'
import './App.css'

const SORT_MODES = new Set(SORT_OPTIONS.map((option) => option.value))
const INITIAL_RENDER_LIMIT = 30

const getToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function SourceDisclosure({ source, stale }) {
  return (
    <aside className="source-disclosure" aria-label="数据口径说明">
      <p><strong>数据来源：</strong><span>AKShare 聚合的东方财富、新浪及同花顺公开基金数据；历史净值和正式规模来自东方财富公开产品页。</span></p>
      {source === 'fallback' || source === 'active-shares' ? <p className="cache-warning">当前为降级数据源，可能仅提供代码、名称和类型。</p> : null}
      {stale ? <p className="cache-warning">今日数据更新失败，当前展示最近一次有效缓存。</p> : null}
      <p>
        <strong>规模口径：</strong>
        <span>估算规模 = 最近公开总份额 × 最新单位净值，并非基金公司每日披露的正式规模。A：同日份额；B：份额日期相差不超过 31 天；C：超过 31 天；U：数据不足。</span>
      </p>
      <p>
        <strong>日更与指标口径：</strong>
        <span>净值每日更新；规模按最近公开份额估算并保留披露日期。规模净增额以去年年末规模为基准，本年新成立产品以成立规模为基准；净值增长与最大回撤按已标注的覆盖起点递推。更新失败时保留最近一次成功版本。</span>
      </p>
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

export default function App({ initialQuery = '', onQueryChange, establishedWindow = null }) {
  const [products, setProducts] = useState([])
  const [shareTotal, setShareTotal] = useState(0)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [dataDate, setDataDate] = useState('')
  const [source, setSource] = useState('')
  const [isStaleCache, setIsStaleCache] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [sortMode, setSortMode] = useState('scale-desc')
  const [reloadKey, setReloadKey] = useState(0)
  const updateTimeRef = useRef('')

  useEffect(() => {
    setQuery(initialQuery ?? '')
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
    const staleCache = cached === null ? readStaleFundCache(window.localStorage, today) : null
    const availableCache = cached ?? staleCache

    if (availableCache?.products.length > 0) {
      setProducts(availableCache.products)
      setShareTotal(availableCache.shareTotal)
      setDataDate(availableCache.dataDate)
      setSource(availableCache.source)
      setIsStaleCache(availableCache !== cached)
      setStatus('ready')
    }

    const loadFunds = async () => {
      try {
        const { payload, source: nextSource } = await fetchFundProductPayload(fetch, { signal: controller.signal })
        const normalized = nextSource === 'products' ? normalizeProducts(payload) : fallbackProductsFromShares(payload)
        const nextDataDate = getPayloadDataDate(payload)
        if (normalized.length === 0) throw new Error('接口未返回有效基金数据')

        setProducts(normalized)
        const nextShareTotal = normalized.reduce((sum, product) => sum + product.shareCount, 0)
        setShareTotal(nextShareTotal)
        setDataDate(nextDataDate)
        updateTimeRef.current = payload.updateTime ?? ''
        setSource(nextSource)
        setIsStaleCache(false)
        setStatus('ready')
        writeFundCache(window.localStorage, {
          date: today,
          dataDate: nextDataDate,
          fetchedAt: Date.now(),
          source: nextSource,
          products: normalized,
          productTotal: normalized.length,
          shareTotal: nextShareTotal,
        })
      } catch (requestError) {
        if (requestError?.name === 'AbortError') return
        if (availableCache?.products.length > 0) {
          setIsStaleCache(true)
          return
        }
        setStatus('error')
        setError(requestError?.message || '数据加载失败，请稍后重试。')
      }
    }

    loadFunds()
    return () => controller.abort()
  }, [reloadKey])

  useEffect(() => {
    const checkForUpdate = () => fetchDataStatus(fetch)
      .then((payload) => {
        if (!updateTimeRef.current || payload.productsUpdateTime !== updateTimeRef.current) {
          setReloadKey((value) => value + 1)
        }
      })
      .catch(() => {})
    const interval = window.setInterval(checkForUpdate, DATA_STATUS_POLL_MS)
    const onVisibility = () => { if (document.visibilityState === 'visible') checkForUpdate() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const effectiveSortMode = sortMode

  const scopeStartDate = useMemo(() => {
    if (!establishedWindow) return null
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(dataDate) ? new Date(`${dataDate}T00:00:00`) : new Date()
    const yearStart = `${anchor.getFullYear()}-01-01`
    if (establishedWindow === 'ytd') return yearStart
    const quarterStart = new Date(anchor)
    quarterStart.setMonth(quarterStart.getMonth() - 3)
    const formatted = `${quarterStart.getFullYear()}-${String(quarterStart.getMonth() + 1).padStart(2, '0')}-${String(quarterStart.getDate()).padStart(2, '0')}`
    return formatted < yearStart ? yearStart : formatted
  }, [dataDate, establishedWindow])
  const scopedProducts = useMemo(() => scopeStartDate
    ? products.filter((product) => product.establishedDate && product.establishedDate >= scopeStartDate && product.establishedDate <= (dataDate || '9999-12-31'))
    : products, [dataDate, products, scopeStartDate])
  const scopedShareTotal = scopedProducts.reduce((total, product) => total + product.shareCount, 0)

  const selection = useMemo(() => selectProducts(scopedProducts, {
    query: debouncedQuery,
    category: selectedCategory,
    sortMode: effectiveSortMode,
  }), [debouncedQuery, effectiveSortMode, scopedProducts, selectedCategory])
  const selectedProducts = selection.products
  const displayedProducts = selectedProducts.slice(0, INITIAL_RENDER_LIMIT)

  useEffect(() => {
    if (selection.matchedShareCodes.size === 0) return
    const matchingIds = scopedProducts
      .filter((product) => product.shares.some((share) => selection.matchedShareCodes.has(share.code)))
      .map((product) => product.productId)
    setExpandedIds((current) => new Set([...current, ...matchingIds]))
  }, [scopedProducts, selection.matchedShareCodes])

  const toggleProduct = (productId) => setExpandedIds((current) => {
    const next = new Set(current)
    if (next.has(productId)) next.delete(productId)
    else next.add(productId)
    return next
  })
  const handleCategoryChange = (value) => {
    setSelectedCategory(value)
    if (value === '全部') setQuery('')
  }

  const handleSortModeChange = (value) => {
    if (SORT_MODES.has(value)) setSortMode(value)
  }

  const resetConditions = () => {
    setQuery('')
    handleCategoryChange('全部')
  }

  const revealDatabase = () => window.requestAnimationFrame(() => {
    document.querySelector('.fund-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  const selectSummaryCategory = (category) => {
    setQuery('')
    handleCategoryChange(category)
    revealDatabase()
  }

  const selectSummaryFund = (fundName) => {
    handleCategoryChange('全部')
    setQuery(fundName)
    revealDatabase()
  }

  return (
    <div className="app-shell">
      <main className="content">
        <div className="meta-row">
          <p>数据日期：<strong>{dataDate || '--'}</strong></p>
          {status === 'ready' ? <p><strong>基金产品 {scopedProducts.length.toLocaleString('zh-CN')} 只｜基金份额 {scopedShareTotal.toLocaleString('zh-CN')} 个</strong></p> : null}
        </div>

        {status === 'ready' ? (
          <DailyProductSummary
            products={scopedProducts}
            dataDate={dataDate}
            establishedWindow={establishedWindow}
            scopeStartDate={scopeStartDate}
            onSelectCategory={selectSummaryCategory}
            onSelectFund={selectSummaryFund}
          />
        ) : null}

        <FundControls
          query={query}
          category={selectedCategory}
          sortMode={effectiveSortMode}
          onQueryChange={setQuery}
          onCategoryChange={handleCategoryChange}
          onSortModeChange={handleSortModeChange}
          disabled={status === 'error'}
        />

        <div className="active-scope" aria-live="polite">
          <strong>{selectedCategory === '全部' && !debouncedQuery ? `当前范围：${establishedWindow === 'quarter' ? '近三个月成立基金' : establishedWindow === 'ytd' ? '本年至今成立基金' : '全部公募基金'}` : '当前筛选范围'}</strong>
          {scopeStartDate ? <span>成立日期：{scopeStartDate}—{dataDate || '--'}</span> : null}
          {selectedCategory !== '全部' ? <span>分类：{selectedCategory}</span> : null}
          {debouncedQuery ? <span>搜索：{debouncedQuery}</span> : null}
          {selectedCategory !== '全部' || debouncedQuery ? <button type="button" onClick={resetConditions}>清除全部筛选</button> : null}
        </div>

        {status === 'loading' ? <SkeletonView viewMode="list" /> : null}

        {status === 'error' ? (
          <section className="empty-state" role="alert">
            <h2>数据加载失败</h2>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>重新加载</button>
          </section>
        ) : null}

        {status === 'ready' ? <SourceDisclosure source={source} stale={isStaleCache} /> : null}

        {status === 'ready' && selectedProducts.length > 0 ? (
          <>
            <p className="result-count">
              当前匹配 {selectedProducts.length.toLocaleString('zh-CN')} 只基金产品 · 仅展示前30支产品
            </p>
            <FundProductTable products={displayedProducts} expandedIds={expandedIds} matchedShareCodes={selection.matchedShareCodes} onToggle={toggleProduct} />
          </>
        ) : null}

        {status === 'ready' && selectedProducts.length === 0 ? <EmptyState onReset={resetConditions} /> : null}
      </main>
    </div>
  )
}
