import { memo } from 'react'

const FIELD_LABELS = {
  type: '基金类型',
  netValue: '单位净值',
  dailyChangePercent: '日涨跌幅',
  lastNetValueDate: '最新净值日期',
  purchaseStatus: '申购状态',
  redemptionStatus: '赎回状态',
  operationStatus: '运作状态',
}

const CHANGE_STYLES = {
  up: { color: 'var(--gain)' },
  down: { color: 'var(--loss)' },
}

export const formatValue = (value) => (
  value === null || value === undefined || value === '' ? '--' : String(value)
)

export const formatNetValue = (value) => (
  value === null || value === undefined ? '--' : Number(value).toFixed(4)
)

export const formatDailyChange = (value) => {
  if (value === null || value === undefined) return '--'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${Number(value).toFixed(2)}%`
}

export const getChangeClass = (value) => {
  if (value > 0) return 'change change--up'
  if (value < 0) return 'change change--down'
  return 'change'
}

export const getChangeStyle = (value) => {
  if (value > 0) return CHANGE_STYLES.up
  if (value < 0) return CHANGE_STYLES.down
  return undefined
}

function StatusBadge({ value }) {
  return <span className="status-badge">{formatValue(value)}</span>
}

function FundDetail({ label, children }) {
  return (
    <div className="fund-detail">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function FundCard({ fund }) {
  return (
    <article className="fund-card">
      <div className="fund-card__heading">
        <h2>{formatValue(fund.name)}</h2>
        <span>{formatValue(fund.code)}</span>
      </div>
      <dl className="fund-card__details">
        <FundDetail label={FIELD_LABELS.type}>{formatValue(fund.type)}</FundDetail>
        <FundDetail label={FIELD_LABELS.netValue}>{formatNetValue(fund.netValue)}</FundDetail>
        <FundDetail label={FIELD_LABELS.dailyChangePercent}>
          <span className={getChangeClass(fund.dailyChangePercent)} style={getChangeStyle(fund.dailyChangePercent)}>
            {formatDailyChange(fund.dailyChangePercent)}
          </span>
        </FundDetail>
        <FundDetail label={FIELD_LABELS.lastNetValueDate}>{formatValue(fund.lastNetValueDate)}</FundDetail>
        <FundDetail label={FIELD_LABELS.purchaseStatus}><StatusBadge value={fund.purchaseStatus} /></FundDetail>
        <FundDetail label={FIELD_LABELS.redemptionStatus}><StatusBadge value={fund.redemptionStatus} /></FundDetail>
        <FundDetail label={FIELD_LABELS.operationStatus}><StatusBadge value={fund.operationStatus} /></FundDetail>
      </dl>
    </article>
  )
}

export const FundCards = memo(function FundCards({ funds }) {
  return (
    <section className="fund-grid" aria-label="基金卡片">
      {funds.map((fund) => <FundCard fund={fund} key={fund.code} />)}
    </section>
  )
})

export const FundTable = memo(function FundTable({ funds }) {
  return (
    <div className="fund-table-wrap">
      <table className="fund-table">
        <caption className="sr-only">基金份额列表</caption>
        <thead>
          <tr>
            <th scope="col">基金名称</th>
            <th scope="col">代码</th>
            <th scope="col">{FIELD_LABELS.type}</th>
            <th scope="col">{FIELD_LABELS.netValue}</th>
            <th scope="col">{FIELD_LABELS.dailyChangePercent}</th>
            <th scope="col">{FIELD_LABELS.lastNetValueDate}</th>
            <th scope="col">{FIELD_LABELS.purchaseStatus}</th>
            <th scope="col">{FIELD_LABELS.redemptionStatus}</th>
            <th scope="col">{FIELD_LABELS.operationStatus}</th>
          </tr>
        </thead>
        <tbody>
          {funds.map((fund) => (
            <tr key={fund.code}>
              <th scope="row">{formatValue(fund.name)}</th>
              <td>{formatValue(fund.code)}</td>
              <td>{formatValue(fund.type)}</td>
              <td>{formatNetValue(fund.netValue)}</td>
              <td className={getChangeClass(fund.dailyChangePercent)} style={getChangeStyle(fund.dailyChangePercent)}>
                {formatDailyChange(fund.dailyChangePercent)}
              </td>
              <td>{formatValue(fund.lastNetValueDate)}</td>
              <td><StatusBadge value={fund.purchaseStatus} /></td>
              <td><StatusBadge value={fund.redemptionStatus} /></td>
              <td><StatusBadge value={fund.operationStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

export function SkeletonView({ viewMode }) {
  if (viewMode === 'list') {
    return (
      <div className="fund-table-wrap skeleton-table" aria-label="数据加载中" aria-busy="true">
        <span className="skeleton skeleton--metric" />
        <span className="skeleton skeleton--metric" />
        <span className="skeleton skeleton--metric" />
      </div>
    )
  }

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
