import { useEffect, useState } from 'react'
import { EVIDENCE_NAMES, fetchThemeWorkspace } from '../data/themeData.js'

const statusText = { priority_research: '重点研究', active_watch: '积极观察', neutral_tracking: '中性跟踪', cautious: '谨慎', risk_or_unverified: '风险或缺乏验证', insufficient_data: '数据不足' }
function ScoreBar({ value }) { return <span className="score-bar"><i style={{ width: `${value ?? 0}%` }} /></span> }
function ThemeDetail({ item }) {
  return <div className="theme-detail">
    <div className="evidence-list">
      {Object.entries(item.evidence).map(([key, evidence]) => <section key={key} className="evidence-row">
        <div><strong>{EVIDENCE_NAMES[key]}</strong><span>{evidence.score ?? '数据不足'}</span></div>
        <ScoreBar value={evidence.score} />
        <p>{evidence.rule}</p>
        {evidence.evidence.length ? <ul>{evidence.evidence.map((text) => <li key={text}>{text}</li>)}</ul> : null}
      </section>)}
    </div>
    {item.degradedReasons.length ? <div className="degraded-box"><strong>降级与缺失</strong><ul>{item.degradedReasons.map((text) => <li key={text}>{text}</li>)}</ul></div> : null}
    <div className="scenario-box">
      {item.scenarioStatus === 'insufficient_history' ? <><strong>历史数据不足，暂不生成情景概率</strong><p>当前 {item.availablePoints} 个历史点，至少需要 {item.requiredPoints} 个不同日期的快照。</p></> : <p>情景数据状态：{item.scenarioStatus}</p>}
    </div>
    <p className="research-disclaimer">{item.disclaimer}</p>
  </div>
}
export function ThemeWorkspace() {
  const [items, setItems] = useState([]); const [state, setState] = useState('loading'); const [open, setOpen] = useState(null)
  useEffect(() => { const controller = new AbortController(); fetchThemeWorkspace((url) => fetch(url, { signal: controller.signal })).then((data) => { setItems(data); setState('ready') }).catch((error) => { if (error.name !== 'AbortError') setState('error') }); return () => controller.abort() }, [])
  return <section className="theme-workspace">
    <div className="workspace-heading"><div><h2>五主题研究总览</h2><p>机会评分与置信度独立展示；单期数据不推断趋势。</p></div><span className={`data-state data-state--${state}`}>{state === 'ready' ? '数据已加载' : state === 'loading' ? '加载中' : '数据不可用'}</span></div>
    {state === 'error' ? <div className="workspace-empty">主题研究数据暂时不可用，请稍后重试。</div> : null}
    <div className="theme-grid">{items.map((item) => <article className={`theme-panel ${open === item.theme ? 'theme-panel--open' : ''}`} key={item.theme}>
      <button className="theme-summary" type="button" aria-expanded={open === item.theme} aria-label={`查看${item.name}证据`} onClick={() => setOpen(open === item.theme ? null : item.theme)}>
        <div className="theme-name"><h3>{item.name}</h3><span>{statusText[item.status] ?? item.status}</span></div>
        <div className="theme-score"><strong>{item.score ?? '--'}</strong><span>机会试算</span></div>
        <div className="confidence"><strong>{item.confidence.score}</strong><span>置信度</span></div>
        <span className="detail-cue">{open === item.theme ? '收起' : '查看证据'}</span>
      </button>
      {open === item.theme ? <ThemeDetail item={item} /> : null}
    </article>)}</div>
  </section>
}
