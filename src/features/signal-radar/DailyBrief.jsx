export function DailyBrief({ brief, signals, open, onToggle, onOpenSignal }) {
  if (!brief) return <section className="daily-brief"><button type="button" disabled>今日决策信号日报 · 尚未生成</button></section>
  return <section className="daily-brief">
    <button type="button" aria-expanded={open} onClick={onToggle}>今日决策信号日报 <span>{open ? '收起' : '展开'}</span></button>
    {open ? <div className="daily-brief__body"><h2>今日 Top Call</h2><strong>{brief.topCall}</strong><p>{brief.body}</p><small>{brief.windowStart} — {brief.windowEnd}</small><div>{brief.signalIds.map((id) => { const signal = signals.find((item) => item.id === id); return signal ? <button key={id} type="button" onClick={(event) => onOpenSignal(id, event.currentTarget)}>{signal.title}</button> : null })}</div></div> : null}
  </section>
}
