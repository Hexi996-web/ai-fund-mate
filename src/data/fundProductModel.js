import { getFundCategories, normalizeFunds } from './fundModel.js'

const normalizeMetric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const normalizeProductDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? String(value) : null

const normalizeCode = (value) => {
  const code = String(value ?? '').trim()
  return code ? code.padStart(6, '0') : null
}

const validProduct = (product) => {
  if (!product?.productId || !product?.productName || !Array.isArray(product?.shares)) return false
  if (product.shareCount !== product.shares.length || product.shares.length === 0) return false
  const codes = product.shares.map((share) => normalizeCode(share?.code))
  return !codes.includes(null) && codes.includes(normalizeCode(product.representativeCode))
}

export const normalizeProducts = (payload) => {
  if (!Number.isInteger(payload?.productTotal) || !Number.isInteger(payload?.shareTotal) || !Array.isArray(payload?.products)) return []
  if (payload.productTotal !== payload.products.length || !payload.products.every(validProduct)) return []
  const shareTotal = payload.products.reduce((total, product) => total + product.shares.length, 0)
  if (shareTotal !== payload.shareTotal) return []
  return payload.products.map((product) => {
    const shares = normalizeFunds({ funds: product.shares }).map((share) => {
      const original = product.shares.find((item) => normalizeCode(item.code) === share.code)
      return {
        ...share,
        productId: product.productId,
        productName: product.productName,
        shareClass: original?.shareClass ?? 'UNKNOWN',
        groupingConfidence: original?.groupingConfidence ?? product.groupingConfidence ?? 'low',
        groupingRule: original?.groupingRule ?? null,
      }
    })
    const representativeShare = shares.find((share) => share.code === normalizeCode(product.representativeCode))
    if (!representativeShare || shares.length !== product.shares.length) return null
    return {
      productId: String(product.productId),
      productName: String(product.productName).trim(),
      type: product.type ?? representativeShare.type,
      representativeCode: representativeShare.code,
      representativeShare,
      shareCount: shares.length,
      groupingConfidence: product.groupingConfidence ?? 'low',
      shares,
      scaleYi: shares.some((share) => share.scaleYi !== null) ? shares.reduce((sum, share) => sum + (share.scaleYi ?? 0), 0) : null,
      scaleDate: shares.map((share) => share.scaleDate).filter(Boolean).sort().at(-1) ?? null,
      scaleStatus: shares.some((share) => share.scaleYi !== null) ? '各份额估算规模合计' : '待披露',
      scaleQuality: shares.some((share) => share.scaleQuality === 'U') ? 'U' : shares.some((share) => share.scaleQuality === 'C') ? 'C' : shares.some((share) => share.scaleQuality === 'B') ? 'B' : shares.some((share) => share.scaleQuality === 'A') ? 'A' : 'U',
      establishedDate: normalizeProductDate(product.establishedDate) ?? shares.map((share) => share.establishedDate).filter(Boolean).sort()[0] ?? null,
      initialScaleYi: normalizeMetric(product.initialScaleYi),
      currentScaleYi: normalizeMetric(product.currentScaleYi) ?? (shares.some((share) => share.scaleYi !== null) ? shares.reduce((sum, share) => sum + (share.scaleYi ?? 0), 0) : null),
      baselineScaleYi: normalizeMetric(product.baselineScaleYi),
      baselineScaleDate: normalizeProductDate(product.baselineScaleDate),
      baselineScaleType: product.baselineScaleType ?? '待补充去年年末规模',
      scaleNetIncreaseYi: normalizeMetric(product.scaleNetIncreaseYi),
      scaleGrowthPercent: normalizeMetric(product.scaleGrowthPercent),
      ytdStartNav: normalizeMetric(product.ytdStartNav),
      baselineNavDate: normalizeProductDate(product.baselineNavDate) ?? normalizeProductDate(product.metricsCoverageStart),
      baselineNavType: product.baselineNavType === '成立' ? '成立' : '年初',
      navGrowthPercent: normalizeMetric(product.navGrowthPercent),
      maxDrawdownPercent: normalizeMetric(product.maxDrawdownPercent),
      drawdownStartDate: normalizeProductDate(product.drawdownStartDate),
      drawdownEndDate: normalizeProductDate(product.drawdownEndDate),
      metricsCoverageStart: normalizeProductDate(product.metricsCoverageStart),
      metricsAsOf: normalizeProductDate(product.metricsAsOf),
      metricsCoverage: product.metricsCoverage ?? '待积累',
    }
  }).filter(Boolean)
}

export const fallbackProductsFromShares = (payload) => normalizeFunds(payload).map((share) => ({
  productId: `fallback_${share.code}`,
  productName: share.name,
  type: share.type,
  representativeCode: share.code,
  representativeShare: { ...share, shareClass: 'UNKNOWN', groupingConfidence: 'low' },
  shareCount: 1,
  groupingConfidence: 'low',
  shares: [{ ...share, shareClass: 'UNKNOWN', groupingConfidence: 'low' }],
}))

const SORT_FIELDS = {
  'scale-desc': ['currentScaleYi', -1],
  'scale-net-desc': ['scaleNetIncreaseYi', -1],
  'scale-growth-desc': ['scaleGrowthPercent', -1],
  'nav-growth-desc': ['navGrowthPercent', -1],
  'drawdown-desc': ['maxDrawdownPercent', -1],
}

const compare = (left, right, direction) => {
  const leftMissing = left === null || left === undefined
  const rightMissing = right === null || right === undefined
  if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1
  if (left < right) return -direction
  if (left > right) return direction
  return 0
}

export const selectProducts = (products, options = {}) => {
  const query = String(options.query ?? '').trim().toLowerCase()
  const matchedShareCodes = new Set()
  const selected = (Array.isArray(products) ? products : []).filter((product) => {
    const productMatch = !query || [product.productId, product.productName]
      .some((value) => String(value ?? '').toLowerCase().includes(query))
    const shareMatches = query
      ? product.shares.filter((share) => [share.code, share.name]
        .some((value) => String(value ?? '').toLowerCase().includes(query)))
      : []
    shareMatches.forEach((share) => matchedShareCodes.add(share.code))
    const categoryMatch = !options.category || options.category === '全部' || options.category === 'all'
      || getFundCategories({ type: product.type, name: product.productName }).includes(options.category)
    return (productMatch || shareMatches.length > 0) && categoryMatch
  })
  const sort = SORT_FIELDS[options.sortMode]
  const sorted = !sort ? [...selected] : [...selected].sort((a, b) => {
    const [field, direction] = sort
    const productFields = new Set(['currentScaleYi', 'scaleNetIncreaseYi', 'scaleGrowthPercent', 'navGrowthPercent', 'maxDrawdownPercent'])
    const left = field === 'code' ? a.representativeCode : productFields.has(field) ? a[field] : a.representativeShare?.[field]
    const right = field === 'code' ? b.representativeCode : productFields.has(field) ? b[field] : b.representativeShare?.[field]
    return compare(left, right, direction)
  })
  return { products: sorted, matchedShareCodes }
}
