import { useEffect, useMemo, useState } from 'react'
import { ATTENTION_POOL } from '../data/attentionPool.js'

const DRIVERS = ['全部','技术','人口','健康','能源','资源','安全','消费','环境']
const STAGE_CLASS = {'结构萌芽':'seed','产业启动':'start','酝酿':'brew','共振':'resonance','叙事过热':'overheat'}
const plotPosition = (value) => Math.min(95, Math.max(5, value))

function CandidateDetail({ item, onSelectCore }) {
  if (!item) return null
  return <aside className="attention-detail">
    <div><small>{item.driver}驱动 · {item.stage}</small><strong>{item.name}</strong><span>{item.bucket}</span></div>
    <p>{item.thesis}</p>
    {item.proof?<p className="attention-proof">数据：{item.proof.attention.source} · {item.proof.validation.source} · {item.proof.validation.asOf}</p>:null}
    <dl><div><dt>媒体注意力代理</dt><dd>{item.attention}</dd></div><div><dt>产品市场验证</dt><dd>{item.industry}</dd></div><div><dt>资产承载</dt><dd>{item.capacity}</dd></div></dl>
    <section><small>下一项关键验证</small><strong>{item.validation}</strong></section>
    <footer>{item.bucket === '核心10' ? <button type="button" onClick={() => onSelectCore(item.id)}>查看核心产品判断 →</button> : <span>尚未进入核心10：继续观察产业验证与产品时点</span>}</footer>
  </aside>
}

export function AttentionHeatmap({ onSelectCore }) {
  const [driver,setDriver] = useState('全部')
  const [selectedId,setSelectedId] = useState('industrial-software')
  const [showLabels,setShowLabels] = useState(false)
  const [snapshot,setSnapshot] = useState({items:[],verifiedCount:0,universeCount:ATTENTION_POOL.length,recommendedIds:[],generatedAt:''})
  useEffect(()=>{const controller=new AbortController();fetch('/attention_pool_evidence.json',{cache:'no-store',signal:controller.signal}).then((response)=>response.ok?response.json():Promise.reject()).then(setSnapshot).catch(()=>{});return()=>controller.abort()},[])
  const candidates = useMemo(()=>{
    const evidence = new Map((snapshot.items||[]).filter((item)=>item.verified).map((item)=>[item.id,item]))
    const recommended = new Set(snapshot.recommendedIds||[])
    return ATTENTION_POOL.flatMap((item)=>{
      const proof=evidence.get(item.id)
      return proof?[{...item,bucket:recommended.has(item.id)?'核心10':'接近入池',attention:proof.attention.score,industry:proof.validation.score,capacity:proof.capacity.score,proof}]:[]
    })
  },[snapshot.items,snapshot.recommendedIds])
  const visible = useMemo(() => driver === '全部' ? candidates : candidates.filter((item)=>item.driver===driver),[candidates,driver])
  const active = candidates.find((item)=>item.id===selectedId) || visible[0] || candidates[0]
  return <section className="attention-section" aria-label="未来社会注意力方向热力图">
    <header className="attention-head"><div><p>{snapshot.verifiedCount||0}/{snapshot.universeCount||36}个方向已形成完整公开数据坐标；其余方向保留观察但不上图。位置使用媒体注意力代理与真实基金市场验证，不代表收益预测。</p></div><div className="attention-legend"><span><i className="legend-core"/>核心10</span><span><i className="legend-near"/>接近入池</span><span><i className="legend-watch"/>观察</span></div></header>
    <div className="attention-toolbar" aria-label="候选池筛选"><div>{DRIVERS.map((item)=><button type="button" className={driver===item?'active':''} onClick={()=>setDriver(item)} key={item}>{item}</button>)}</div><label><input type="checkbox" checked={showLabels} onChange={(event)=>setShowLabels(event.target.checked)}/> 显示名称</label></div>
    <div className="attention-grid">
      <div className="attention-canvas">
        <div className="attention-y-title">社会注意力潜力 ↑</div>
        <div className="quadrant quadrant--lead"><b>提前预研区</b><strong>产品市场开始验证，社会注意力尚未集中</strong></div>
        <div className="quadrant quadrant--resonance"><b>产品—注意力共振区</b><strong>基金市场验证与社会关注同步增强</strong></div>
        <div className="quadrant quadrant--seed"><b>结构萌芽区</b><strong>长期逻辑存在，产品市场验证仍不足</strong></div>
        <div className="quadrant quadrant--risk"><b>叙事验证区</b><strong>公众关注跑在产品市场验证之前</strong></div>
        {visible.map((item)=><button type="button" aria-label={`${item.name}，媒体注意力${item.attention}，产品市场验证${item.industry}`} title={item.name} className={`attention-dot attention-dot--${STAGE_CLASS[item.stage] || 'seed'} ${item.bucket==='核心10'?'is-core':''} ${selectedId===item.id?'is-active':''}`} style={{left:`${plotPosition(item.industry)}%`,bottom:`${plotPosition(item.attention)}%`,width:`${18+item.capacity*.18}px`,height:`${18+item.capacity*.18}px`}} onClick={()=>setSelectedId(item.id)} key={item.id}>{showLabels || selectedId===item.id ? <span>{item.name}</span> : null}</button>)}
        <div className="attention-midline attention-midline--x"/><div className="attention-midline attention-midline--y"/>
      </div>
      {active?<CandidateDetail item={active} onSelectCore={onSelectCore}/>:<aside className="attention-detail attention-detail--empty"><strong>真实数据校验中</strong><p>当前没有同时通过媒体注意力、板块历史趋势与资产承载三项校验的方向，因此不绘制模拟坐标。</p></aside>}
    </div>
  </section>
}
