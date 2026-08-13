import { useEffect, useRef } from 'react'

const focusableSelector = 'button:not([disabled]), a[href], select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function SignalDrawer({ signal, isWatched, onToggleWatch, onClose, returnFocusRef }) {
  const drawerRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!signal) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const items = [...drawerRef.current.querySelectorAll(focusableSelector)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus()
    }
  }, [onClose, returnFocusRef, signal])

  if (!signal) return null
  return (
    <div className="drawer-layer">
      <button className="drawer-overlay" type="button" aria-label="关闭信号详情" onClick={onClose} />
      <aside ref={drawerRef} className="signal-drawer" role="dialog" aria-modal="true" aria-label="信号详情">
        <header><div><span>{signal.category.toUpperCase()} · {signal.observedAt}</span><h2>{signal.title}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label="关闭抽屉">×</button></header>
        <div className="drawer-scroll">
          <section><h3>事实</h3><p>{signal.fact}</p></section>
          <section className="agent-interpretation"><h3>Agent 解读</h3><p>{signal.interpretation}</p><small>该部分为研究推断，需人工复核。</small></section>
          <section><h3>传导链</h3><ol className="transmission-chain">{signal.transmission.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h3>受影响资产</h3><div className="asset-tags">{signal.affectedAssets.map((item) => <span key={item}>{item}</span>)}</div></section>
          <section><h3>相关基金检索词</h3><p>{signal.relatedFundKeywords.join(' / ')}</p></section>
          <section className="counter-section"><h3>反方证据与失效条件</h3><ul>{[...signal.counterEvidence, ...signal.invalidationConditions].map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><h3>下一步研究</h3><p>{signal.recommendedAction}</p></section>
          <section className="source-section"><h3>来源与口径</h3><p>{signal.sourceNote}</p>{signal.sourceUrl ? <a href={signal.sourceUrl} target="_blank" rel="noreferrer">查看{signal.sourceName}原始来源</a> : <span>{signal.sourceName} · 无外部链接</span>}</section>
        </div>
        <footer><button type="button" className="watch-button" onClick={onToggleWatch}>{isWatched ? '移出机会观察池' : '加入机会观察池'}</button></footer>
      </aside>
    </div>
  )
}
