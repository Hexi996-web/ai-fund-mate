const EVIDENCE_LABELS = { official: '官方', public: '公开数据', proxy: '代理', demo: '演示' }

export function SignalSummary({ summary, regime }) {
  return (
    <>
      <section className="radar-summary" aria-labelledby="radar-summary-title">
        <div>
          <p className="radar-eyebrow">产品机会预研 · 不构成投资建议</p>
          <h2 id="radar-summary-title">今日决策摘要</h2>
          <p className="radar-top-call"><strong>Top Call：</strong>{summary.topSignal?.title ?? '暂无有效信号'}</p>
        </div>
        <dl className="radar-stats">
          <div><dt>全部信号</dt><dd>{summary.total}</dd></div>
          <div><dt>高重要性</dt><dd>{summary.highImportance}</dd></div>
          <div><dt>官方证据</dt><dd>{summary.official}</dd></div>
          <div><dt>代理/演示</dt><dd>{summary.proxyOrDemo}</dd></div>
        </dl>
      </section>
      <section className="regime-section" aria-labelledby="regime-title">
        <div className="section-heading"><div><h2 id="regime-title">市场环境</h2><p>状态判断仅用于产品研究语境</p></div></div>
        <div className="regime-strip">
          {regime.map((item) => <article key={item.id} className={`regime-item regime-item--${item.tone}`}><span>{item.label}</span><strong>{item.state}</strong><small>{item.observedAt} · {EVIDENCE_LABELS[item.evidenceType]}</small></article>)}
        </div>
      </section>
    </>
  )
}
