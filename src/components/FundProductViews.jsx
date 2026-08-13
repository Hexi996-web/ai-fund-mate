import { memo } from 'react'
import {
  formatDailyChange,
  formatNetValue,
  formatValue,
  getChangeClass,
  getChangeStyle,
} from './FundViews.jsx'

const shareLabel = (value) => value === 'DEFAULT' ? '默认' : value === 'RMB' ? '人民币' : value

function ShareRows({ product, matchedShareCodes }) {
  return (
    <div className="fund-share-list" id={`shares-${product.productId}`}>
      {product.shares.map((share) => (
        <div className="fund-share-row" data-search-match={matchedShareCodes.has(share.code) ? 'true' : 'false'} key={share.code}>
          <strong>{shareLabel(share.shareClass)}类 · {share.code}</strong>
          <span>{formatValue(share.name)}</span>
          <span>净值 {formatNetValue(share.netValue)}</span>
          <span className={getChangeClass(share.dailyChangePercent)} style={getChangeStyle(share.dailyChangePercent)}>
            {formatDailyChange(share.dailyChangePercent)}
          </span>
          <span>{formatValue(share.purchaseStatus)} / {formatValue(share.redemptionStatus)}</span>
          <span>{formatValue(share.lastNetValueDate)}</span>
        </div>
      ))}
    </div>
  )
}

function ProductSummary({ product }) {
  const share = product.representativeShare
  return (
    <>
      <div className="fund-card__heading">
        <h2>{product.productName}</h2>
        <span>{product.representativeCode}</span>
      </div>
      <p className="representative-share">
        代表份额：{shareLabel(share.shareClass)}类（{share.code}）
      </p>
      <div className="fund-product-metrics">
        <span>{formatValue(product.type)}</span>
        <span>净值 {formatNetValue(share.netValue)}</span>
        <span className={getChangeClass(share.dailyChangePercent)} style={getChangeStyle(share.dailyChangePercent)}>
          {formatDailyChange(share.dailyChangePercent)}
        </span>
        <span>{formatValue(share.lastNetValueDate)}</span>
      </div>
    </>
  )
}

export const FundProductCards = memo(function FundProductCards({
  products, expandedIds, matchedShareCodes, onToggle,
}) {
  return (
    <section className="fund-grid" aria-label="基金产品卡片">
      {products.map((product) => {
        const expanded = expandedIds.has(product.productId)
        return (
          <article className="fund-card fund-product-card" key={product.productId}>
            <ProductSummary product={product} />
            <button
              className="share-toggle"
              type="button"
              aria-expanded={expanded}
              aria-controls={`shares-${product.productId}`}
              onClick={() => onToggle(product.productId)}
            >
              {expanded ? '收起份额' : `查看${product.shareCount}个份额`}
            </button>
            {expanded ? <ShareRows product={product} matchedShareCodes={matchedShareCodes} /> : null}
          </article>
        )
      })}
    </section>
  )
})

export const FundProductTable = memo(function FundProductTable({
  products, expandedIds, matchedShareCodes, onToggle,
}) {
  return (
    <div className="fund-table-wrap">
      <table className="fund-table fund-product-table">
        <caption className="sr-only">基金产品列表</caption>
        <thead><tr><th>基金产品</th><th>代表份额</th><th>类型</th><th>净值</th><th>日涨跌幅</th><th>份额</th></tr></thead>
        <tbody>
          {products.map((product) => {
            const share = product.representativeShare
            const expanded = expandedIds.has(product.productId)
            return [
              <tr key={product.productId}>
                <th scope="row">{product.productName}</th>
                <td>{shareLabel(share.shareClass)}类（{share.code}）</td>
                <td>{formatValue(product.type)}</td>
                <td>{formatNetValue(share.netValue)}</td>
                <td>{formatDailyChange(share.dailyChangePercent)}</td>
                <td><button className="share-toggle" type="button" aria-expanded={expanded} aria-controls={`shares-${product.productId}`} onClick={() => onToggle(product.productId)}>{expanded ? '收起份额' : `查看${product.shareCount}个份额`}</button></td>
              </tr>,
              expanded ? <tr className="fund-product-share-detail" key={`${product.productId}-shares`}><td colSpan="6"><ShareRows product={product} matchedShareCodes={matchedShareCodes} /></td></tr> : null,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
})
