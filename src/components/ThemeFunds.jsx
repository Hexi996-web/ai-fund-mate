const matchLabel = (fund) => fund.reviewStatus === 'reviewed' ? '人工审核' : '自动匹配'

export function ThemeFunds({ group, onOpenFundLibrary }) {
  if (group?.unavailableReason) return <section className="theme-funds"><h4>相关基金</h4><p className="funds-unavailable">{group.unavailableReason}</p></section>
  if (!group?.featured?.length) return <section className="theme-funds"><h4>相关基金</h4><p className="funds-unavailable">暂无经规则匹配的相关基金</p></section>
  return <section className="theme-funds">
    <div className="theme-funds__heading"><div><h4>相关基金</h4><p>按审核状态、匹配置信度和数据完整度排序</p></div><button type="button" onClick={() => onOpenFundLibrary?.({ query: '', contextLabel: '主题相关基金' })}>查看全部相关基金</button></div>
    <div className="theme-funds__grid">{group.featured.map((fund) => <article className="theme-fund-card" key={fund.code}>
      <div className="theme-fund-card__title"><div><strong>{fund.name}</strong><span>{fund.code} · {fund.type}</span></div><button type="button" onClick={() => onOpenFundLibrary?.({ query: fund.code, contextLabel: `来自主题研判：${fund.name}` })}>在产品库查看</button></div>
      <div className="theme-fund-tags"><span>{matchLabel(fund)}</span><span>匹配度 {Math.round(fund.confidence * 100)}%</span>{fund.bondCategory ? <span>{fund.bondCategory}</span> : null}</div>
      <p>{fund.analysis}</p>
    </article>)}</div>
  </section>
}
