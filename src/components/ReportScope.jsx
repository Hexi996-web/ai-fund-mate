export function ReportScope({ items, label = '本摘要数据口径' }) {
  return <dl className="report-scope" aria-label={label}>
    {items.map((item) => <div key={item.term}>
      <dt>{item.term}</dt>
      <dd>{item.description}</dd>
    </div>)}
  </dl>
}
