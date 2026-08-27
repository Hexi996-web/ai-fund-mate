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

const STATE_ORDER = ["新线索", "提前预研", "叙事验证", "窗口临近", "窗口开启", "拥挤观察", "证据转弱", "暂时退出"];

function ThemeStateHistory({ item, proof, history }) {
  const rows = history.filter((row) => row.states?.[item.id]).slice(-8);
  const fallback = proof?.lifecycle || item.lifecycle || windowState(item, proof);
  const current = rows.at(-1)?.states?.[item.id] || fallback;
  return <section className="state-history">
    <header><div><strong>主题状态迁移</strong><small>{item.name}</small></div><b>{current?.state || current?.label || "基线建立中"}</b></header>
    <div className="state-rail" aria-label={`${item.name}状态轨迹`}>
      {STATE_ORDER.map((state) => <span className={state === (current?.state || current?.label) ? "current" : ""} key={state}>{state}</span>)}
    </div>
    <ol>{rows.length ? rows.map((row, index) => { const state = row.states[item.id]; const previous = index ? rows[index - 1].states[item.id]?.state : null; return <li key={row.date} className={previous && previous !== state.state ? "changed" : ""}><time>{row.date.slice(5)}</time><b>{state.state}</b><span>{state.reason}</span></li>; }) : <li className="changed"><time>{String(proof?.validation?.asOf || "").slice(5, 10) || "本期"}</time><b>{current?.state || current?.label || "基线建立中"}</b><span>{current?.reason || current?.action || "首期状态将在下一次更新时写入不可覆盖的历史快照。"}</span></li>}</ol>
  </section>;
}

function ModelCalibration({ calibration }) {
  const horizons = calibration?.horizons || [{ days: 90, label: "3个月", status: "积累中" }, { days: 180, label: "半年", status: "积累中" }, { days: 365, label: "一年", status: "积累中" }];
  const [horizonDays, setHorizonDays] = useState(horizons[0]?.days || 90);
  const active = horizons.find((row) => row.days === horizonDays) || horizons[0];
  const nextDate = calibration?.oldestForecastDate ? new Date(new Date(`${calibration.oldestForecastDate}T00:00:00`).getTime() + (active?.days || 90) * 86400000).toISOString().slice(0, 10) : null;
  return <section className="model-calibration">
    <header><div><strong>历史命中率与模型校准</strong><small>模型口径 v1 · 仅使用真实季度快照</small></div><span>{active?.status || "积累中"}</span></header>
    <nav aria-label="预测检验期限">{horizons.map((row) => <button type="button" className={row.days === active?.days ? "active" : ""} onClick={() => setHorizonDays(row.days)} key={row.days}>{row.label}</button>)}</nav>
    {active?.evaluable ? <div className="calibration-result"><article><span>正式命中率</span><b>{active.hitRatePercent.toFixed(1)}%</b></article><article><span>综合有效率</span><b>{active.inclusiveHitRatePercent.toFixed(1)}%</b></article><article><span>有效样本</span><b>{active.evaluable}</b></article></div> : <div className="calibration-empty"><b>尚无到期样本</b><span>已保存{calibration?.quarterlyCohorts || 1}期真实预测{nextDate ? `；最早于${nextDate}形成首批${active?.label || ""}检验` : ""}。</span></div>}
    <p>{calibration?.disclosure || "只使用到期的真实预测，数据不足不计入成功或失败。"}</p>
  </section>;
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
    {active ? <div className="decision-history-grid"><ThemeStateHistory item={active} proof={activeProof} history={attention.rankingHistory || []} /><ModelCalibration calibration={attention.modelCalibration} /></div> : null}
  </section>;
}

export { windowState, weekSignal };
