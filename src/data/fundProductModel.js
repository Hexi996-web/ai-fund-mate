import { classifyFund, normalizeFunds } from './fundModel.js'

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
  'change-desc': ['dailyChangePercent', -1],
  'change-asc': ['dailyChangePercent', 1],
  'nav-desc': ['netValue', -1],
  'nav-asc': ['netValue', 1],
  'date-desc': ['lastNetValueDate', -1],
  'date-asc': ['lastNetValueDate', 1],
  'code-asc': ['code', 1],
  'code-desc': ['code', -1],
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
      || classifyFund(product.representativeShare) === options.category
    return (productMatch || shareMatches.length > 0) && categoryMatch
  })
  const sort = SORT_FIELDS[options.sortMode]
  const sorted = !sort ? [...selected] : [...selected].sort((a, b) => {
    const [field, direction] = sort
    const left = field === 'code' ? a.representativeCode : a.representativeShare?.[field]
    const right = field === 'code' ? b.representativeCode : b.representativeShare?.[field]
    return compare(left, right, direction)
  })
  return { products: sorted, matchedShareCodes }
}
