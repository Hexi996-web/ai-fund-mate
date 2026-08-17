const fmt = (value) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
export function CatalystList({ catalysts, onOpenSignal }) {
  return <section className="catalyst-panel"><div className="section-heading"><div><h2>未来催化剂</h2><p>优先展示未来 7 天可验证事件</p></div></div><div className="catalyst-list">
    {catalysts.length ? catalysts.map((item) => <article key={item.id}><time>{fmt(item.scheduledAt)}</time><strong>{item.title}</strong><p>{item.description}</p>{item.signalId ? <button type="button" onClick={(event) => onOpenSignal(item.signalId, event.currentTarget)}>查看关联信号</button> : null}</article>) : <p>未来 7 天暂无已确认催化剂</p>}
  </div></section>
}
