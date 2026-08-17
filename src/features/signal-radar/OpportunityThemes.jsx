import { getThemeEvidence } from './signalModel.js'

export function OpportunityThemes({ themes, signals, onOpenSignal }) {
  return (
    <aside className="opportunity-panel" aria-labelledby="opportunity-title">
      <div className="section-heading"><div><h2 id="opportunity-title">机会主题</h2><p>多信号交叉后的研究候选</p></div></div>
      <div className="opportunity-list">
        {themes.map((theme) => {
          const evidence = getThemeEvidence(theme, signals)
          return <article key={theme.id} className="opportunity-card"><div><span>信心 {theme.confidence}</span><b>{theme.action}</b></div><h3>{theme.title}</h3><p>{evidence.supporting.length} 条支持证据 · {evidence.counter.length || 1} 项反证/失效条件</p><button type="button" onClick={(event) => onOpenSignal(evidence.supporting[0]?.id, event.currentTarget)}>查看关键证据</button></article>
        })}
      </div>
    </aside>
  )
}
