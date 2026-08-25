import { useEffect, useMemo, useState } from 'react'
import { ATTENTION_POOL } from '../data/attentionPool.js'

const DRIVERS = ['全部','技术','人口','健康','能源','资源','安全','消费','环境']
const STAGE_CLASS = {'结构萌芽':'seed','产业启动':'start','酝酿':'brew','共振':'resonance','叙事过热':'overheat'}
const plotPosition = (value) => Math.min(95, Math.max(5, value))
const yi = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}亿元` : '—'
const pct = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'

function CandidateDetail({ item, onSelectCore }) {
  if (!item) return null
  return <aside className="attention-detail">
    <div><small>{item.driver}驱动 · {item.stage}</small><strong>{item.name}</strong><span>{item.bucket}</span></div>
    <p>{item.thesis}</p>
    {item.proof?<p className="attention-proof">数据：{item.proof.attention.source} · {item.proof.validation.source} · {item.proof.capacity.boardName || item.proof.capacity.source}（主题代理）· {item.proof.validation.asOf}</p>:<p className="attention-proof">待完成公开注意力、基金市场和可投资资产的统一映射，暂不生成坐标。</p>}
    <dl><div><dt>社会注意力验证</dt><dd>{item.proof?item.attention:'—'}</dd></div><div><dt>产品市场验证</dt><dd>{item.proof?item.industry:'—'}</dd></div><div><dt>资产承载</dt><dd>{item.proof?item.capacity:'—'}</dd></div></dl>
    {item.proof?<div className="attention-breakdowns"><details><summary>社会注意力窗口</summary><div><span><small>近7日上榜</small><b>{item.proof.attention.recent7Appearances ?? 0}次</b></span><span><small>近30日上榜</small><b>{item.proof.attention.recent30Appearances ?? 0}次</b></span><span><small>近30日活跃</small><b>{item.proof.attention.activeDays30d ?? 0}天</b></span><span><small>双平台共振</small><b>{item.proof.attention.crossPlatformHits30d ?? 0}次</b></span></div></details><details><summary>产品市场验证构成</summary><div><span><small>净流入代理</small><b>{yi(item.proof.validation.estimatedNetFlowYi)}</b></span><span><small>规模净增加</small><b>{yi(item.proof.validation.scaleNetIncreaseYi)}</b></span><span><small>增长率</small><b>{pct(item.proof.validation.scaleGrowthPercent)}</b></span><span><small>增长广度</small><b>{pct(item.proof.validation.growthBreadthPercent)}</b></span><span><small>有效产品</small><b>{item.proof.validation.effectiveFunds ?? 0}只</b></span><span><small>头部占比</small><b>{pct(item.proof.validation.top1SharePercent)}</b></span></div></details></div>:null}
    <section><small>下一项关键验证</small><strong>{item.validation}</strong></section>
    <footer>{item.bucket === '核心10' ? <button type="button" onClick={() => onSelectCore(item.id)}>查看核心产品判断 →</button> : <span>尚未进入核心10：继续观察产业验证与产品时点</span>}</footer>
  </aside>
}

export function AttentionHeatmap({ onSelectCore, focusId = '' }) {
  const [driver,setDriver] = useState('全部')
  const [selectedId,setSelectedId] = useState('industrial-software')
  const [showLabels,setShowLabels] = useState(false)
  const [snapshot,setSnapshot] = useState({items:[],verifiedCount:0,universeCount:ATTENTION_POOL.length,recommendedIds:[],generatedAt:''})
  useEffect(()=>{const controller=new AbortController();fetch('/attention_pool_evidence.json',{cache:'no-store',signal:controller.signal}).then((response)=>response.ok?response.json():Promise.reject()).then(setSnapshot).catch(()=>{});return()=>controller.abort()},[])
  useEffect(()=>{if(focusId)setSelectedId(focusId)},[focusId])
  const candidates = useMemo(()=>{
    const evidence = new Map((snapshot.items||[]).filter((item)=>item.verified).map((item)=>[item.id,item]))
    const recommended = new Set(snapshot.recommendedIds||[])
    return ATTENTION_POOL.map((item)=>{
      const proof=evidence.get(item.id)
      return proof?{...item,bucket:recommended.has(item.id)?'核心10':'接近入池',attention:proof.attention.score,industry:proof.validation.score,capacity:proof.capacity.score,proof}:{...item,bucket:'待数据映射',proof:null}
    })
  },[snapshot.items,snapshot.recommendedIds])
  const visible = useMemo(() => driver === '全部' ? candidates : candidates.filter((item)=>item.driver===driver),[candidates,driver])
  const plotted = visible.filter((item)=>item.proof)
  const pending = visible.filter((item)=>!item.proof)
  const active = candidates.find((item)=>item.id===selectedId) || visible[0] || candidates[0]
  return <section className="attention-section" aria-label="未来社会注意力方向热力图">
    <header className="attention-head"><div><p>母池36个方向全部展示：{snapshot.verifiedCount||0}个使用完整公开数据坐标，{Math.max(0,(snapshot.universeCount||36)-(snapshot.verifiedCount||0))}个列入待映射观察带；不使用模拟坐标。</p></div><div className="attention-legend"><span><i className="legend-core"/>核心10外圈</span><span><i className="legend-seed"/>结构萌芽</span><span><i className="legend-start"/>产业启动</span><span><i className="legend-brew"/>酝酿</span><span><i className="legend-resonance"/>共振</span><span><i className="legend-overheat"/>叙事验证</span></div></header>
    <div className="attention-toolbar" aria-label="候选池筛选"><div>{DRIVERS.map((item)=><button type="button" className={driver===item?'active':''} onClick={()=>setDriver(item)} key={item}>{item}</button>)}</div><label><input type="checkbox" checked={showLabels} onChange={(event)=>setShowLabels(event.target.checked)}/> 显示名称</label></div>
    <div className="attention-grid">
        <div className="attention-canvas">
        <div className="quadrant quadrant--lead"><b>叙事验证区</b><strong>公众关注跑在产品市场验证之前</strong></div>
        <div className="quadrant quadrant--resonance"><b>产品—注意力共振区</b><strong>基金市场验证与社会关注同步增强</strong></div>
        <div className="quadrant quadrant--seed"><b>结构萌芽区</b><strong>长期逻辑存在，产品市场验证仍不足</strong></div>
        <div className="quadrant quadrant--risk"><b>提前预研区</b><strong>产品市场开始验证，社会注意力尚未集中</strong></div>
        {plotted.map((item)=><button type="button" aria-label={`${item.name}，社会注意力${item.attention}，产品市场验证${item.industry}`} title={item.name} className={`attention-dot attention-dot--${STAGE_CLASS[item.stage] || 'seed'} ${item.bucket==='核心10'?'is-core':''} ${selectedId===item.id?'is-active':''}`} style={{left:`${plotPosition(item.industry)}%`,bottom:`${plotPosition(item.attention)}%`,width:`${18+item.capacity*.18}px`,height:`${18+item.capacity*.18}px`}} onClick={()=>setSelectedId(item.id)} key={item.id}>{showLabels || selectedId===item.id ? <span>{item.name}</span> : null}</button>)}
        <div className="attention-midline attention-midline--x"/><div className="attention-midline attention-midline--y"/>
      </div>
      {pending.length?<div className="attention-pending"><div><strong>待数据映射 · {pending.length}</strong><small>保留在母池，不参与坐标与核心10排序</small></div><section>{pending.map((item)=><button type="button" className={selectedId===item.id?'active':''} onClick={()=>setSelectedId(item.id)} key={item.id}><i/>{item.name}</button>)}</section></div>:null}
      {active?<CandidateDetail item={active} onSelectCore={onSelectCore}/>:<aside className="attention-detail attention-detail--empty"><strong>真实数据校验中</strong><p>当前没有同时通过社会注意力、产品市场验证与资产承载三项校验的方向，因此不绘制模拟坐标。</p></aside>}
    </div>
  </section>
}
