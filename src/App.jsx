import { useEffect, useMemo, useState } from 'react'
import avatarUrl from './assets/fund-mate-avatar.png'
import './App.css'

const API_URL = 'https://LST-Serendipity.github.io/fund-data-api/funds_simple.json'
const CACHE_KEY = 'ai-fund-mate:funds:v1'

const getToday = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const firstPresent = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/[%￥,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const seededDailyChange = (code, date) => {
  const seed = `${code}-${date}`.split('').reduce((total, char) => {
    return (total * 31 + char.charCodeAt(0)) >>> 0
  }, 2166136261)
  return Number((-2 + (seed % 5001) / 1000).toFixed(2))
}

const normalizeFund = (record, today) => {
  const rawCode = firstPresent(record, [
    'fundCode', 'code', 'FCODE', 'fund_code', 'symbol', 'jjdm',
  ])
  const rawName = firstPresent(record, [
    'fundName', 'name', 'SHORTNAME', 'fund_name', 'shortName', 'jjjc',
  ])

  if (rawCode === null || rawName === null) return null

  const code = String(rawCode).trim().padStart(6, '0')
  const name = String(rawName).trim()
  if (!code || !name) return null

  const nav = toNumber(firstPresent(record, [
    'netValue', 'nav', 'unitNetValue', 'estimatedValue', 'estimateValue',
    'DWJZ', 'dwjz', 'gsz', 'net_value',
  ]))
  const realDailyChange = toNumber(firstPresent(record, [
    'dailyChangePercent', 'dailyChange', 'changeRate', 'growthRate',
    'JZZZL', 'gszzl', 'dayGrowth', 'change_percent',
  ]))

  return {
    code,
    name,
    nav,
    dailyChange: realDailyChange ?? seededDailyChange(code, today),
    isSimulatedChange: realDailyChange === null,
  }
}

const normalizeFunds = (payload, today) => {
  const records = Array.isArray(payload)
    ? payload
    : payload?.data ?? payload?.funds ?? payload?.list ?? []

  if (!Array.isArray(records)) throw new Error('基金数据格式无法识别')

  const seen = new Set()
  return records.reduce((funds, record) => {
    const fund = normalizeFund(record, today)
    if (fund && !seen.has(fund.code)) {
      seen.add(fund.code)
      funds.push(fund)
    }
    return funds
  }, [])
}

const readCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    if (!cached || !Array.isArray(cached.funds) || !cached.date) return null
    return cached
  } catch {
    return null
  }
}

const writeCache = (date, funds) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date, fetchedAt: Date.now(), funds }))
  } catch (error) {
    console.warn('基金数据已加载，但浏览器缓存写入失败。', error)
  }
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.2 4.2" />
    </svg>
  )
}

function FundCard({ fund }) {
  const isUp = fund.dailyChange >= 0
  return (
    <article className="fund-card">
      <div className="fund-card__heading">
        <h2>{fund.name}</h2>
        <span>{fund.code}</span>
      </div>
      <div className="fund-card__metrics">
        <div>
          <span className="metric-label">估算净值</span>
          <strong>{fund.nav === null ? '--' : fund.nav.toFixed(4)}</strong>
        </div>
        <div className="metric-divider" aria-hidden="true" />
        <div>
          <span className="metric-label">
            日涨跌幅{fund.isSimulatedChange ? <sup title="模拟值">*</sup> : null}
          </span>
          <strong className={isUp ? 'change change--up' : 'change change--down'}>
            {isUp ? '+' : ''}{fund.dailyChange.toFixed(2)}%
          </strong>
        </div>
      </div>
    </article>
  )
}

function SkeletonGrid() {
  return (
    <div className="fund-grid" aria-label="数据加载中" aria-busy="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <span className="skeleton skeleton--title" />
          <span className="skeleton skeleton--code" />
          <span className="skeleton skeleton--metric" />
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [funds, setFunds] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [dataDate, setDataDate] = useState('')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    const today = getToday()
    const cached = readCache()

    if (cached?.date === today && cached.funds.length > 0) {
      setFunds(cached.funds)
      setDataDate(cached.date)
      setStatus('ready')
      return () => controller.abort()
    }

    const loadFunds = async () => {
      setStatus('loading')
      try {
        const response = await fetch(API_URL, { signal: controller.signal })
        if (!response.ok) throw new Error(`数据请求失败（${response.status}）`)
        const payload = await response.json()
        const normalized = normalizeFunds(payload, today)
        if (normalized.length === 0) throw new Error('接口未返回有效基金数据')

        setFunds(normalized)
        setDataDate(today)
        setStatus('ready')
        writeCache(today, normalized)
      } catch (requestError) {
        if (requestError.name === 'AbortError') return
        if (cached?.funds?.length) {
          setFunds(cached.funds)
          setDataDate(cached.date)
          setStatus('ready')
          setError('今日数据更新失败，当前展示最近一次缓存。')
        } else {
          setStatus('error')
          setError(requestError.message || '数据加载失败，请稍后重试。')
        }
      }
    }

    loadFunds()
    return () => controller.abort()
  }, [])

  const filteredFunds = useMemo(() => {
    if (!debouncedQuery) return funds
    const keyword = debouncedQuery.toLocaleLowerCase('zh-CN')
    return funds.filter((fund) => {
      return fund.code.includes(keyword) || fund.name.toLocaleLowerCase('zh-CN').includes(keyword)
    })
  }, [debouncedQuery, funds])

  const assistantMessage = useMemo(() => {
    if (status === 'loading') return '你好，我是你的基金同事，正在整理今日数据...'
    if (status === 'error') return '今天的数据暂时没有整理好，请稍后再试。'
    if (debouncedQuery && filteredFunds.length === 0) {
      return '抱歉，没找到你持有的基金，试试输入基金代码或简称。'
    }
    return `已就绪，共收录 ${funds.length.toLocaleString('zh-CN')} 只基金，你可以按名称或代码搜索。`
  }, [debouncedQuery, filteredFunds.length, funds.length, status])

  return (
    <div className="app-shell">
      <header className="assistant-header">
        <div className="header-inner">
          <div className="brand">
            <h1>AI虚拟产品经理同事</h1>
            <p>AI Fund Mate</p>
          </div>
          <div className="assistant-row">
            <div className="avatar-wrap" aria-hidden="true">
              <img src={avatarUrl} alt="" />
              <span className={status === 'loading' ? 'status-dot status-dot--loading' : 'status-dot'} />
            </div>
            <div className="speech-bubble" aria-live="polite">
              <p>{assistantMessage}</p>
              {status === 'loading' && (
                <span className="thinking-dots" aria-label="正在加载">
                  <i /><i /><i />
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="content">
        <div className="meta-row">
          <p>数据更新时间：<strong>{dataDate || getToday()}</strong></p>
          {error && status === 'ready' ? <p className="cache-warning">{error}</p> : null}
        </div>

        <label className="search-box">
          <span className="sr-only">搜索基金名称或代码</span>
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索基金名称或代码"
            disabled={status === 'error'}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
              清除
            </button>
          )}
        </label>

        {status === 'loading' && <SkeletonGrid />}

        {status === 'error' && (
          <section className="empty-state" role="alert">
            <h2>数据加载失败</h2>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>重新加载</button>
          </section>
        )}

        {status === 'ready' && filteredFunds.length > 0 && (
          <>
            <p className="result-count">
              {debouncedQuery ? `找到 ${filteredFunds.length.toLocaleString('zh-CN')} 只基金` : `全部 ${funds.length.toLocaleString('zh-CN')} 只基金`}
            </p>
            <section className="fund-grid" aria-label="基金列表">
              {filteredFunds.map((fund) => <FundCard key={fund.code} fund={fund} />)}
            </section>
            {funds.some((fund) => fund.isSimulatedChange) && (
              <p className="data-note">* 数据源未提供日涨跌幅的基金使用 -2% 至 +3% 的稳定模拟值，仅供界面演示。</p>
            )}
          </>
        )}

        {status === 'ready' && filteredFunds.length === 0 && (
          <section className="empty-state">
            <h2>没有匹配结果</h2>
            <p>换一个基金名称、简称或六位代码试试。</p>
            <button type="button" onClick={() => setQuery('')}>清空搜索</button>
          </section>
        )}
      </main>
    </div>
  )
}
