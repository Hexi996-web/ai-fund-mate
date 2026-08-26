import { useMemo, useState } from "react";

const WINDOWS = { 90: "近3个月", 180: "近半年", 365: "近1年" };
const COLORS = { attention: "#e1a43b", enterprise: "#347cbf", market: "#7d64cf", product: "#2f9b72" };
const SERIES_LABELS = { attention: "社会注意力", enterprise: "龙头收入", market: "板块价格", product: "同类规模" };

const finite = (value) => Number.isFinite(Number(value));
const change = (rows, field) => {
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  if (values.length < 2 || !values[0]) return null;
  return ((values.at(-1) / values[0]) - 1) * 100;
};
const signed = (value) => finite(value) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%` : "积累中";

function normalize(rows) {
  const values = rows.map((row) => row.value).filter(Number.isFinite);
  if (values.length < 2) return [];
  const low = Math.min(...values), high = Math.max(...values), spread = high - low || 1;
  return rows.map((row, index) => ({
    ...row,
    x: 5 + (index / Math.max(1, rows.length - 1)) * 90,
    y: 88 - ((row.value - low) / spread) * 72,
  }));
}

function TrendChart({ series }) {
  return <div className="theme-trend-chart" aria-label="主题四线趋势图">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
      {[25, 50, 75].map((y) => <line x1="3" x2="97" y1={y} y2={y} key={y} />)}
      {Object.entries(series).map(([key, rows]) => {
        const points = normalize(rows);
        return points.length > 1 ? <polyline key={key} stroke={COLORS[key]} points={points.map((p) => `${p.x},${p.y}`).join(" ")} /> : null;
      })}
    </svg>
  </div>;
}

function Sparkline({ rows, field }) {
  const points = normalize(rows.map((row) => ({ date: row.date, value: Number(row[field]) })).filter((row) => Number.isFinite(row.value)));
  return <svg className="external-sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
    {points.length > 1 ? <polyline points={points.map((point) => `${point.x},${6 + point.y * .28}`).join(" ")} /> : null}
  </svg>;
}

function productSeries(item, proof) {
  const validation = proof?.validation || {};
  const baseline = finite(validation.currentScaleYi) && finite(validation.scaleNetIncreaseYi)
    ? Number(validation.currentScaleYi) - Number(validation.scaleNetIncreaseYi)
    : item.market?.baselineTotal;
  return [
    { date: item.market?.baselineScaleDate || "2025-12-31", value: Number(baseline) },
    { date: item.market?.currentScaleDate || "当前", value: Number(validation.currentScaleYi ?? item.market?.total) },
  ].filter((row) => Number.isFinite(row.value));
}

function deriveDecision(item, proof, evidence, attentionRows) {
  const enterpriseRows = [...(evidence?.enterprise?.history || [])].reverse();
  const enterpriseDelta = change(enterpriseRows.slice(-3), "revenueGrowthMedian");
  const marketDelta = change((evidence?.assets?.marketHistory || []).slice(-60), "close");
  const productDelta = proof?.validation?.scaleGrowthPercent;
  const attentionScore = proof?.attention?.score || 0;
  const matureDays = proof?.attention?.observedDays || 0;
  let stage = "证据积累";
  let divergence = "暂无足够注意力历史判断背离";
  if (matureDays >= 30) {
    if (attentionScore >= 60 && (enterpriseDelta || 0) > 0 && (productDelta || 0) > 0) stage = "需求—注意力共振";
    else if (attentionScore >= 60 && (enterpriseDelta || 0) <= 0) stage = "叙事领先产业";
    else if (attentionScore < 45 && (enterpriseDelta || 0) > 0) stage = "产业领先注意力";
    else if ((enterpriseDelta || 0) < 0 && (productDelta || 0) < 0) stage = "证伪观察";
    else stage = "持续验证";
    divergence = attentionScore >= 60 && (enterpriseDelta || 0) <= 0
      ? "注意力领先、企业兑现偏弱：防止追逐叙事"
      : attentionScore < 45 && (enterpriseDelta || 0) > 0
        ? "企业兑现领先、注意力未破圈：属于提前预研信号"
        : "注意力与产业暂未出现明显反向背离";
  }
  return { stage, divergence, enterpriseDelta, marketDelta, productDelta, attentionPoints: attentionRows.length };
}

export function ThemeDecisionCockpit({ item, proof, evidence, attentionHistory, rankingHistory = [], externalSignals }) {
  const [windowDays, setWindowDays] = useState(365);
  const model = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - windowDays);
    const attentionRows = (attentionHistory?.daily || []).filter((row) => new Date(row.date) >= cutoff).map((row) => ({ date: row.date, value: Number(row.themes?.[item.id]?.appearances || 0) }));
    const enterprise = [...(evidence?.enterprise?.history || [])].reverse().filter((row) => new Date(row.reportDate) >= cutoff).map((row) => ({ date: row.reportDate, value: Number(row.revenueGrowthMedian) }));
    const market = (evidence?.assets?.marketHistory || []).filter((row) => new Date(row.date) >= cutoff).map((row) => ({ date: row.date, value: Number(row.close) }));
    const product = productSeries(item, proof).filter((row) => windowDays >= 365 || new Date(row.date) >= cutoff);
    const series = { attention: attentionRows, enterprise, market, product };
    return { series, decision: deriveDecision(item, proof, evidence, attentionRows) };
  }, [item, proof, evidence, attentionHistory, windowDays]);
  const priorRank = [...rankingHistory].slice(0, -1).reverse().find((row) => row.rankedIds?.includes(item.id));
  const priorPosition = priorRank?.rankedIds?.indexOf(item.id) + 1;
  const wikiRows = externalSignals?.wikimedia?.daily || [];
  const wikiRecent = wikiRows.slice(-30).reduce((sum, row) => sum + Number(row.views || 0), 0);
  const wikiPrior = wikiRows.slice(-60, -30).reduce((sum, row) => sum + Number(row.views || 0), 0);
  const wikiChange = wikiPrior ? (wikiRecent / wikiPrior - 1) * 100 : null;
  return <section className="theme-cockpit" aria-label="主题趋势与假设验证">
    <header>
      <div><h3>主题趋势与假设验证</h3><p>四类公开数据统一观察；各曲线按自身区间标准化，只比较方向，不比较绝对值。</p></div>
      <nav aria-label="趋势时间范围">{Object.entries(WINDOWS).map(([days, label]) => <button type="button" className={windowDays === Number(days) ? "active" : ""} onClick={() => setWindowDays(Number(days))} key={days}>{label}</button>)}</nav>
    </header>
    <div className="theme-cockpit__status">
      <div><small>当前阶段</small><strong>{model.decision.stage}</strong></div>
      <div><small>注意力—产业关系</small><strong>{model.decision.divergence}</strong></div>
      <div><small>排序变化</small><strong>{priorRank ? `上次第${priorPosition}名 · ${priorRank.period}` : "从本期开始留存"}</strong></div>
    </div>
    <div className="theme-cockpit__trend">
      <div className="theme-trend-legend">{Object.entries(SERIES_LABELS).map(([key, label]) => <span key={key}><i style={{ background: COLORS[key] }} />{label}<b>{key === "attention" ? `${model.decision.attentionPoints}个观察日` : key === "enterprise" ? signed(model.decision.enterpriseDelta) : key === "market" ? signed(model.decision.marketDelta) : signed(model.decision.productDelta)}</b></span>)}</div>
      <TrendChart series={model.series} />
    </div>
    <div className="theme-cockpit__external theme-cockpit__external--single">
      <article>
        <div><small>长期公众认知 · Wikimedia</small><strong>{wikiRows.length ? `${wikiRows.length}日历史 · 近30日${signed(wikiChange)}` : externalSignals?.wikimedia?.status || "未覆盖"}</strong><span>{externalSignals?.wikimedia?.titles?.length ? `词条篮子：${externalSignals.wikimedia.titles.join(" / ")}` : "相关词条均没有可用数据"}</span></div>
        <Sparkline rows={wikiRows} field="views" />
      </article>
    </div>
  </section>;
}
