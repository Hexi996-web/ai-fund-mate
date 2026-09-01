export function DynamicAnalysisPanel({ analysis, title = '动态分析' }) {
  const report = analysis?.report
  if (!report) return null
  const sourceLabel = analysis.loading ? '分析生成中' : analysis.source === 'model' ? `${analysis.provider || '大模型'}动态研判` : analysis.source === 'codex-manual' ? 'Codex人工研判' : '规则研判'
  return <section className="dynamic-analysis" aria-label={title}>
    <header><div><small>{title}</small><h3>{report.headline}</h3></div><span data-source={analysis.source}>{sourceLabel}</span></header>
    <p>{report.overallJudgment}</p>
    <div className="dynamic-analysis__grid">
      <article><h4>变化归因</h4><ul>{report.changeAttribution.map((item) => <li key={item}>{item}</li>)}</ul></article>
      <article><h4>风险提示</h4><ul>{report.risks.map((item) => <li key={item}>{item}</li>)}</ul></article>
      <article><h4>下一步跟踪</h4><ul>{report.nextActions.map((item) => <li key={item}>{item}</li>)}</ul></article>
    </div>
    <footer>分析基于截至 {analysis.dataDate || '当前'} 的结构化数据；模型结论属于研究推断，不构成投资建议。</footer>
  </section>
}
