import { memo } from 'react'
import {
  formatDailyChange,
  formatNetValue,
  formatValue,
  getChangeClass,
  getChangeStyle,
} from './FundViews.jsx'

const shareLabel = (value) => value === 'DEFAULT' ? '默认' : value === 'RMB' ? '人民币' : value
const formatScale = (value) => value === null || value === undefined ? '待披露' : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 亿元`
const formatPercent = (value, missing = '待积累') => value === null || value === undefined ? missing : `${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const metricClass = (value) => value === null || value === undefined ? '' : value > 0 ? 'change--up' : value < 0 ? 'change--down' : ''

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
          <span title={`净值日 ${share.scaleDate || '--'}；份额日 ${share.sharesDate || '--'}`}>估算规模 {formatScale(share.scaleYi)} · {share.scaleQuality ?? 'U'}级</span>
        </div>
      ))}
    </div>
  )
}

export const FundProductTable = memo(function FundProductTable({
  products, expandedIds, matchedShareCodes, onToggle,
}) {
  return (
    <div className="fund-table-wrap">
      <table className="fund-table fund-product-table">
        <caption className="sr-only">基金产品列表</caption>
        <thead><tr><th>排名</th><th>基金产品</th><th>成立日期</th><th>代表份额 / 代码</th><th>单位净值</th><th>当前规模</th><th>规模净增额</th><th>规模增长率</th><th>净值增长</th><th>最大回撤</th><th>份额</th></tr></thead>
        <tbody>
          {products.map((product, index) => {
            const share = product.representativeShare
            const expanded = expandedIds.has(product.productId)
            return [
              <tr key={product.productId}>
                <td className="rank-cell">{index + 1}</td>
                <th scope="row">{product.productName}<span className="cell-note">{formatValue(product.type)}</span></th>
                <td>{product.establishedDate || '待补充'}</td>
                <td>{shareLabel(share.shareClass)}类（{share.code}）</td>
                <td>{formatNetValue(share.netValue)}<span className="cell-note">{formatDailyChange(share.dailyChangePercent)} · {share.lastNetValueDate || '待更新'}</span></td>
                <td>{formatScale(product.currentScaleYi)}<span className="cell-note">{product.scaleQuality}级 · {product.scaleDate || '待补全'}</span></td>
                <td className={metricClass(product.scaleNetIncreaseYi)}>{formatScale(product.scaleNetIncreaseYi)}<span className="cell-note">基准：{product.baselineScaleType}</span></td>
                <td className={metricClass(product.scaleGrowthPercent)}>{formatPercent(product.scaleGrowthPercent, '待基准')}</td>
                <td className={metricClass(product.navGrowthPercent)}>{formatPercent(product.navGrowthPercent)}<span className="cell-note">{product.metricsCoverage}</span></td>
                <td className={metricClass(product.maxDrawdownPercent)}>{formatPercent(product.maxDrawdownPercent)}<span className="cell-note">{product.drawdownStartDate && product.drawdownEndDate ? `${product.drawdownStartDate}—${product.drawdownEndDate}` : product.metricsCoverage}</span></td>
                <td><button className="share-toggle" type="button" aria-expanded={expanded} aria-controls={`shares-${product.productId}`} onClick={() => onToggle(product.productId)}>{expanded ? '收起份额' : `查看${product.shareCount}个份额`}</button></td>
              </tr>,
              expanded ? <tr className="fund-product-share-detail" key={`${product.productId}-shares`}><td colSpan="11"><ShareRows product={product} matchedShareCodes={matchedShareCodes} /></td></tr> : null,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
})
