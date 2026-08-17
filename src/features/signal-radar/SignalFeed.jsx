import { SignalBadges } from './SignalBadges.jsx'

const LABELS = {
  category: { policy: '政策', macro: '宏观', market: '市场', customer: '客户' },
  evidence: { official: '官方', public: '公开数据', proxy: '需求代理', demo: '演示' },
  importance: { high: '高', medium: '中', low: '低' },
  direction: { positive: '利好', neutral: '中性', negative: '利空' },
  horizon: { short: '短期', medium: '中期', long: '长期' },
}

export function SignalFeed({ signals, onOpenSignal, total, hasMore, onLoadMore }) {
  return (
    <section className="signal-panel" aria-labelledby="signal-feed-title">
      <div className="section-heading"><div><h2 id="signal-feed-title">信号流</h2><p>按重要性、证据质量与新鲜度排序</p></div><span>已显示 {signals.length} / {total} 条</span></div>
      <div className="signal-list">
        {signals.map((signal) => (
          <button key={signal.id} type="button" className="signal-row" data-signal-id={signal.id} data-signal-category={signal.category} onClick={(event) => onOpenSignal(signal.id, event.currentTarget)}>
            <span className="signal-row__meta"><b>{LABELS.category[signal.category] ?? signal.category}</b><i className={`evidence evidence--${signal.evidenceType}`}>{LABELS.evidence[signal.evidenceType]}</i><i>重要性 {LABELS.importance[signal.importance]} · 评分 {signal.priority}</i><SignalBadges signal={signal} /></span>
            <span className="signal-row__body"><strong>{signal.title}</strong><small>{signal.summary}</small></span>
            <span className="signal-row__facts"><span>{signal.validationStatus === 'confirmed' ? '已确认' : '需复核'}</span><span>{signal.observedAt}</span><span>{signal.affectedAssets.slice(0, 2).join(' / ')}</span></span>
          </button>
        ))}
      </div>
      {hasMore ? <button type="button" className="load-more" onClick={onLoadMore}>加载更多</button> : null}
    </section>
  )
}
