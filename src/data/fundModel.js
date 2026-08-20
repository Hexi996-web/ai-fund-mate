const firstPresent = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).trim().replace(/%$/, ''))
  return Number.isFinite(number) ? number : null
}

const normalizeDate = (value) => {
  if (value === null || value === undefined || value === '') return null
  const date = String(value).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? date
    : null
}

const normalizeCode = (value) => {
  if (value === null || value === undefined || value === '') return null
  const code = String(value).trim()
  return code ? code.padStart(6, '0') : null
}

const normalizeText = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

const INACTIVE_PATTERN = /terminated|suspected_terminated|\u7ec8\u6b62|\u6e05\u7b97|\u5df2\u6e05\u76d8|\u7ec8\u6b62\u4e0a\u5e02/i
const isInactive = (fund) => INACTIVE_PATTERN.test(`${fund.name ?? ''} ${fund.operationStatus ?? ''}`)

export const normalizeFunds = (payload) => {
  const records = Array.isArray(payload?.funds) ? payload.funds : []
  const seenCodes = new Set()

  return records.reduce((funds, record) => {
    const fund = {
      code: normalizeCode(firstPresent(record, ['code', 'fundCode', 'fundcode', '\u57fa\u91d1\u4ee3\u7801'])),
      name: normalizeText(firstPresent(record, ['name', 'fundName', 'fundname', '\u57fa\u91d1\u7b80\u79f0'])),
      type: normalizeText(firstPresent(record, ['type', 'fundType', 'fundtype', '\u57fa\u91d1\u7c7b\u578b'])),
      netValue: normalizeNumber(firstPresent(record, ['netValue', 'netvalue', 'unitNetValue', 'dwjz'])),
      dailyChangePercent: normalizeNumber(firstPresent(record, ['dailyChangePercent', 'daygrowth', 'dailyGrowth', 'dailyChange'])),
      lastNetValueDate: normalizeDate(firstPresent(record, ['lastNetValueDate', 'netValueDate', 'date'])),
      purchaseStatus: normalizeText(firstPresent(record, ['purchaseStatus', 'purchase_status'])),
      redemptionStatus: normalizeText(firstPresent(record, ['redemptionStatus', 'redemption_status'])),
      operationStatus: normalizeText(firstPresent(record, ['operationStatus', 'operation_status'])),
      scaleYi: normalizeNumber(firstPresent(record, ['scaleYi', 'latestScaleYi', 'scale'])),
      totalSharesYi: normalizeNumber(firstPresent(record, ['totalSharesYi'])),
      scaleDate: normalizeDate(firstPresent(record, ['scaleDate', 'latestScaleDate'])),
      sharesDate: normalizeDate(firstPresent(record, ['sharesDate'])),
      scaleStatus: normalizeText(firstPresent(record, ['scaleStatus', 'latestScaleStatus'])),
      scaleQuality: normalizeText(firstPresent(record, ['scaleQuality'])),
      scaleStalenessDays: normalizeNumber(firstPresent(record, ['scaleStalenessDays'])),
      scaleSource: normalizeText(firstPresent(record, ['scaleSource', 'latestScaleSource'])),
    }

    const establishedDate = normalizeDate(firstPresent(record, ['establishedDate', 'launchDate']))
    const initialScaleYi = normalizeNumber(firstPresent(record, ['initialScaleYi', 'raisedScaleYi']))
    if (establishedDate !== null) fund.establishedDate = establishedDate
    if (initialScaleYi !== null) fund.initialScaleYi = initialScaleYi

    if (fund.code === null || fund.name === null || isInactive(fund) || seenCodes.has(fund.code)) return funds
    seenCodes.add(fund.code)
    funds.push(fund)
    return funds
  }, [])
}

const classifyText = (value) => {
  const text = String(value ?? '').toLowerCase()
  if (/fof|\u57fa\u91d1\u4e2d\u57fa\u91d1/.test(text)) return 'FOF'
  if (/\u8d27\u5e01|money/.test(text)) return '\u8d27\u5e01\u5e02\u573a'
  if (/\u80a1\u7968|stock|\u6307\u6570/.test(text)) return '\u80a1\u7968\u578b'
  if (/\u6df7\u5408|mixed/.test(text)) return '\u6df7\u5408\u578b'
  if (/\u503a\u5238|bond/.test(text)) return '\u503a\u5238\u578b'
  return null
}

export const getFundCategories = (fund) => {
  const type = String(fund?.type ?? '').toLowerCase()
  const name = String(fund?.name ?? '').toLowerCase()
  const text = `${type} ${name}`
  const categories = new Set()
  if (/^qdii|海外|全球|纳斯达克|标普|恒生/.test(text)) categories.add('QDII')
  if (/^fof|qdii-fof|基金中基金/.test(text)) categories.add('FOF')
  if (/reits?|不动产投资信托|基础设施/.test(text)) categories.add('REITs')
  if (/^商品|qdii-商品|黄金|白银|原油|豆粕|有色金属|能源化工/.test(text)) categories.add('商品')
  if (/^指数型|etf|联接|index/.test(text)) categories.add('指数型')
  if (/^货币型/.test(type)) categories.add('货币型')
  if (/^股票型/.test(type)) categories.add('股票型')
  if (/^混合型/.test(type)) categories.add('混合型')
  if (/^债券型/.test(type)) categories.add('债券型')
  return [...categories]
}

export const classifyFund = (fund) => (
  classifyText(fund?.type) ?? classifyText(fund?.name) ?? '\u5176\u4ed6'
)

const SORT_FIELDS = {
  'change-desc': ['dailyChangePercent', -1],
  'change-asc': ['dailyChangePercent', 1],
  'nav-desc': ['netValue', -1],
  'nav-asc': ['netValue', 1],
  'date-desc': ['lastNetValueDate', -1],
  'date-asc': ['lastNetValueDate', 1],
  'code-asc': ['code', 1],
  'code-desc': ['code', -1],
}

const compareValues = (left, right, direction) => {
  const leftMissing = left === null || left === undefined
  const rightMissing = right === null || right === undefined
  if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1
  if (left < right) return -1 * direction
  if (left > right) return direction
  return 0
}

export const selectFunds = (funds, options = {}) => {
  const query = String(options.query ?? '').trim().toLowerCase()
  const category = options.category
  const selected = (Array.isArray(funds) ? funds : []).filter((fund) => {
    const matchesQuery = !query || [fund?.code, fund?.name]
      .some((value) => String(value ?? '').toLowerCase().includes(query))
    const matchesCategory = !category || category === '\u5168\u90e8' || category === 'all' || classifyFund(fund) === category
    return matchesQuery && matchesCategory
  })

  const sort = SORT_FIELDS[options.sortMode]
  if (!sort) return [...selected]
  const [field, direction] = sort
  return [...selected].sort((left, right) => compareValues(left?.[field], right?.[field], direction))
}

