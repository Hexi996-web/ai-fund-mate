import { useMemo, useState } from "react";
import { ATTENTION_POOL } from "../data/attentionPool.js";

const score = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const signed = (value, suffix = "") => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}` : "—";

function windowState(item, proof) {
  const attention = score(proof?.attention?.score);
  const demand = score(proof?.validation?.score);
  const capacity = score(proof?.capacity?.score);
  const crowded = item.market.state === "供给过剩" || item.market.launched12.length > 10;
  const shrinking = item.market.scaleGrowth < -10;
  if (crowded && demand >= 55) return { label: "已拥挤", tone: "crowded", action: "方向仍成立，但优先寻找细分表达，避免同质化。" };
  if (shrinking && attention < 35) return { label: "窗口关闭", tone: "closed", action: "注意力与产品需求同时转弱，暂缓新增预研。" };
  if (attention >= 55 && demand >= 55 && capacity >= 55 && !crowded) return { label: "窗口开启", tone: "open", action: "三项证据形成共振，可提高预研优先级。" };
  if (demand >= 50 && capacity >= 50 && !crowded) return { label: "窗口临近", tone: "near", action: "产品需求与资产承载已具备，等待注意力持续扩散。" };
  if ((attention ?? 0) >= 35 || (demand ?? 0) >= 35) return { label: "预研", tone: "research", action: "保留观察，等待第二层证据确认。" };
  return { label: "太早", tone: "early", action: "信号尚弱，只记录假设，不进入产品准备。" };
}

function weekSignal(themeId, daily = []) {
  const values = daily.slice(-14).map((row) => Number(row.themes?.[themeId]?.appearances || 0));
  if (values.length < 8) return { label: "基线建立中", tone: "baseline", change: null, detail: `仅有${values.length}天可比记录` };
  const recent = values.slice(-7).reduce((a, b) => a + b, 0);
  const prior = values.slice(-14, -7).reduce((a, b) => a + b, 0);
  const change = recent - prior;
  if (change >= 3) return { label: "升级", tone: "up", change, detail: `近7日上榜较前7日增加${change}次` };
  if (change <= -3) return { label: "降级", tone: "down", change, detail: `近7日上榜较前7日减少${Math.abs(change)}次` };
  return { label: "持平", tone: "flat", change, detail: `近7日与前7日相差${Math.abs(change)}次` };
}

function snapshotRows(history = []) {
  const byQuarter = new Map();
  history.forEach((row) => byQuarter.set(row.period, row));
  return [...byQuarter.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function Attribution({ item, proof, history }) {
  const current = history.at(-1);
  const previous = history.length > 1 ? history.at(-2) : null;
  const previousScores = previous?.scores?.[item.id];
  const currentScores = current?.scores?.[item.id];
  const currentRank = current?.rankedIds?.indexOf(item.id) + 1 || null;
  const previousRank = previous?.rankedIds?.indexOf(item.id) + 1 || null;
  const factors = previousScores && currentScores ? [
    ["社会注意力", currentScores.attention - previousScores.attention],
    ["产品市场验证", currentScores.validation - previousScores.validation],
    ["资产承载", currentScores.capacity - previousScores.capacity],
  ] : [
    ["社会注意力", score(proof?.attention?.score)],
    ["产品市场验证", score(proof?.validation?.score)],
    ["资产承载", score(proof?.capacity?.score)],
  ];
  return <div className="ranking-attribution">
    <header><div><small>排名变化归因</small><strong>{item.name}</strong></div><span>{previousRank && currentRank ? `第${previousRank}位 → 第${currentRank}位` : "首次分项基线"}</span></header>
    <div>{factors.map(([label, value]) => <article key={label}><span>{label}</span><b>{previousScores ? signed(value, "分") : value == null ? "—" : value.toFixed(1)}</b><i className={value >= 0 ? "positive" : "negative"} style={{ width: `${Math.min(100, Math.max(5, Math.abs(value || 0) * (previousScores ? 6 : 1)))}%` }} /></article>)}</div>
    <p>{previousScores ? "归因比较相邻两次有效快照的分项变化；排名还会受到其他候选方向变化影响。" : "当前仅有一期带分项快照，先展示排序构成；下一次更新后自动切换为变化归因。"}</p>
  </div>;
}

export function ProductDecisionMonitor({ ranked, attention, attentionHistory, attentionById, selectedId, onSelect }) {
  const [snapshotPeriod, setSnapshotPeriod] = useState("current");
  const snapshots = useMemo(() => snapshotRows(attention.rankingHistory || []), [attention.rankingHistory]);
  const alerts = useMemo(() => ranked.map((item) => ({ item, ...weekSignal(item.id, attentionHistory.daily || []) }))
    .sort((a, b) => (b.change ?? -999) - (a.change ?? -999)), [ranked, attentionHistory.daily]);
  const active = ranked.find((item) => item.id === selectedId) || ranked[0];
  const activeProof = active ? attentionById.get(active.id) : null;
  const chosen = snapshotPeriod === "current" ? snapshots[0] : snapshots.find((row) => row.period === snapshotPeriod);
  const nameById = new Map(ATTENTION_POOL.map((item) => [item.id, item.name]));
  return <section className="decision-monitor" aria-label="产品窗口与预警">
    <header><div><h2>产品窗口与变化监测</h2><p>把方向前景与当前产品时点分开判断，变化只使用已保存的真实快照。</p></div><label>季度快照<select value={snapshotPeriod} onChange={(event) => setSnapshotPeriod(event.target.value)}><option value="current">当前季度</option>{snapshots.slice(1).map((row) => <option value={row.period} key={row.period}>{row.period}</option>)}</select></label></header>
    <div className="window-strip">{ranked.map((item) => { const state = windowState(item, attentionById.get(item.id)); return <button type="button" className={`${state.tone} ${active?.id === item.id ? "active" : ""}`} onClick={() => onSelect(item.id)} key={item.id}><span>{item.name}</span><strong>{state.label}</strong><small>{state.action}</small></button>; })}</div>
    <div className="monitor-grid">
      <section className="theme-alerts"><header><strong>主题升降级预警</strong><small>近7日对比前7日</small></header>{alerts.slice(0, 5).map(({ item, label, tone, detail }) => <button type="button" onClick={() => onSelect(item.id)} key={item.id}><span>{item.name}<small>{detail}</small></span><b className={tone}>{label}</b></button>)}</section>
      {active ? <Attribution item={active} proof={activeProof} history={attention.rankingHistory || []} /> : null}
      <section className="quarter-snapshot"><header><strong>季度快照与历史回看</strong><small>{chosen?.period || attention.recommendationReviewQuarter || "当前季度"} · {chosen?.date || String(attention.generatedAt || "").slice(0, 10)}</small></header><ol>{(chosen?.recommendedIds || attention.recommendedIds || []).map((id, index) => <li key={id}><i>{String(index + 1).padStart(2, "0")}</i><span>{nameById.get(id) || id}</span></li>)}</ol>{snapshots.length < 2 ? <p>首期快照已建立；跨季度历史将在后续季度自动保留，不用模拟数据回填。</p> : null}</section>
    </div>
  </section>;
}

export { windowState, weekSignal };
