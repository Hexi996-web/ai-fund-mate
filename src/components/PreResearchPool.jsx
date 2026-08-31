import { useEffect, useMemo, useRef, useState } from "react";
import { DATA_STATUS_POLL_MS, fetchDataStatus } from "../data/dataStatus.js";
import { PRE_RESEARCH_POOL } from "../data/preResearchPool.js";
import { ATTENTION_POOL, CORE_ATTENTION_IDS } from "../data/attentionPool.js";
import { AttentionHeatmap } from "./AttentionHeatmap.jsx";
import { ResearchHorizonBrief } from "./ResearchHorizonBrief.jsx";
import { ThemeDecisionCockpit } from "./ThemeDecisionCockpit.jsx";
import { windowState } from "./ProductDecisionMonitor.jsx";

const yi = (value) =>
  Number.isFinite(value) ? `${value.toFixed(1)}亿元` : "—";
const pct = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "—");
const signedYi = (value) =>
  Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}亿元`
    : "—";
const num = (value) => (value == null ? Number.NaN : Number(value));
const fundGrowth = (fund) =>
  Number.isFinite(num(fund.scaleGrowthPercent))
    ? num(fund.scaleGrowthPercent)
    : Number.isFinite(num(fund.baselineScaleYi)) && num(fund.baselineScaleYi)
      ? ((num(fund.currentScaleYi) - num(fund.baselineScaleYi)) /
          num(fund.baselineScaleYi)) *
        100
      : Number.NaN;

const PRODUCT_DIRECTION_BY_ID = new Map(PRE_RESEARCH_POOL.map((item) => [item.id, item]));
const RESEARCH_UNIVERSE = ATTENTION_POOL.map((theme) => {
  const product = PRODUCT_DIRECTION_BY_ID.get(theme.id);
  return {
    ...theme,
    definition: product?.definition || theme.thesis,
    desire: product?.desire || theme.thesis,
    assetMap: product?.assetMap || `${theme.driver}相关上市公司与跨行业受益资产`,
    question: product?.question || theme.validation,
    narrative: product?.narrative || theme.thesis,
    support: product?.support || `持续跟踪${theme.validation}，确认趋势能否由叙事进入经营兑现。`,
    counter: product?.counter || "注意力上升不等于产业兑现，需警惕概念映射和资产纯度不足。",
    nextQuestion: product?.nextQuestion || `验证${theme.validation}并建立可投资资产清单。`,
    useCase: product?.useCase || `观察${theme.name}的产品化窗口`,
    purity: product?.purity || "由资产承载数据动态验证",
    gap: product?.gap || "由全市场基金快照计算",
    keywords: product?.keywords || [theme.name, theme.driver],
    readiness: product?.readiness ?? theme.capacity,
    ...product,
  };
});
const sortable = (value) => (Number.isFinite(value) ? value : -Infinity);
const latestDate = (values) => values.filter(Boolean).sort().at(-1) || "—";

function MiniTrend({ rows, field, unit = "", delta = false }) {
  const values = rows.map((row) => num(row[field])).filter(Number.isFinite);
  if (values.length < 2)
    return <p className="evidence-principle">历史序列积累中</p>;
  const low = Math.min(...values),
    high = Math.max(...values),
    spread = high - low || 1;
  const points = values
    .map(
      (value, index) =>
        `${((index / (values.length - 1)) * 100).toFixed(2)},${(42 - ((value - low) / spread) * 36).toFixed(2)}`,
    )
    .join(" ");
  const first = values[0],
    last = values.at(-1),
    change = delta ? last - first : first ? (last / first - 1) * 100 : null;
  return (
    <div className="evidence-trend">
      <svg
        viewBox="0 0 100 46"
        role="img"
        aria-label={`${field}历史趋势`}
        preserveAspectRatio="none"
      >
        <polyline points={points} />
      </svg>
      <div>
        <span>{rows[0]?.date || rows[0]?.reportDate}</span>
        <strong>
          {Number.isFinite(change)
            ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}${delta ? "个百分点" : "%"}`
            : "—"}
        </strong>
        <span>
          {rows.at(-1)?.date || rows.at(-1)?.reportDate} · {last.toFixed(1)}
          {unit}
        </span>
      </div>
    </div>
  );
}

function marketMetrics(item, products, updateTime) {
  const peers = products.filter((product) =>
    item.keywords.some((word) =>
      product.productName?.toLowerCase().includes(word.toLowerCase()),
    ),
  );
  const scales = peers
    .map((p) => num(p.currentScaleYi))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  const total = scales.reduce((sum, value) => sum + value, 0);
  const comparable = peers.filter(
    (p) =>
      p.baselineScaleType === "2025年末披露规模" &&
      Number.isFinite(num(p.baselineScaleYi)) &&
      Number.isFinite(num(p.currentScaleYi)),
  );
  const baselineScaleDate = comparable.length ? "2025-12-31" : "—";
  const currentScaleDate = latestDate(
    peers.flatMap((p) => (p.shares || []).map((share) => share.scaleDate)),
  );
  const baselineTotal = comparable.reduce(
    (sum, p) => sum + num(p.baselineScaleYi),
    0,
  );
  const comparableCurrent = comparable.reduce(
    (sum, p) => sum + num(p.currentScaleYi),
    0,
  );
  const scaleIncrease = comparable.reduce(
    (sum, p) =>
      sum +
      (Number.isFinite(num(p.scaleNetIncreaseYi))
        ? num(p.scaleNetIncreaseYi)
        : num(p.currentScaleYi) - num(p.baselineScaleYi)),
    0,
  );
  const scaleGrowth = baselineTotal
    ? (scaleIncrease / baselineTotal) * 100
    : null;
  const top = scales[0] ?? 0;
  const top3 = scales.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const asOf = new Date(String(updateTime || "").replace(" ", "T"));
  const cutoff12 = new Date(asOf);
  cutoff12.setFullYear(cutoff12.getFullYear() - 1);
  const cutoff90 = new Date(asOf);
  cutoff90.setDate(cutoff90.getDate() - 90);
  const launched12 = peers.filter(
    (p) => new Date(p.establishedDate) >= cutoff12,
  );
  const launched90 = peers.filter(
    (p) => new Date(p.establishedDate) >= cutoff90,
  );
  const gapScore =
    peers.length < 3
      ? 40
      : Math.max(
          0,
          Math.min(
            100,
            92 -
              peers.length * 1.5 -
              launched12.length * 2 +
              (total && top3 / total > 0.65 ? 8 : 0),
          ),
        );
  const supplyState =
    launched12.length > 10 || launched90.length > 4
      ? "新增拥挤"
      : launched12.length < 3
        ? "新增稀少"
        : "新增适中";
  const scaleState =
    scaleGrowth > 10 ? "规模扩张" : scaleGrowth < -10 ? "规模收缩" : "规模平稳";
  const state =
    peers.length < 8
      ? "产品缺失"
      : peers.length > 35 && supplyState === "新增拥挤"
        ? "供给过剩"
        : supplyState === "新增稀少" && scaleState === "规模扩张"
          ? "存在空位"
          : "继续观察";
  return {
    count: peers.length,
    launched12,
    launched90,
    total,
    baselineTotal,
    baselineScaleDate,
    currentScaleDate,
    comparableCurrent,
    comparableCount: comparable.length,
    scaleIncrease,
    scaleGrowth,
    supplyState,
    scaleState,
    topShare: total ? (top / total) * 100 : null,
    top3Share: total ? (top3 / total) * 100 : null,
    gapScore,
    state,
    peers: peers.sort(
      (a, b) => (b.currentScaleYi || 0) - (a.currentScaleYi || 0),
    ),
  };
}

function MetricButton({ label, value, onClick }) {
  return (
    <button
      type="button"
      className="decision-metric decision-metric--link"
      onClick={onClick}
    >
      <small>{label}</small>
      <strong>{value}</strong>
      <span>查看依据 →</span>
    </button>
  );
}

const evidenceMeta = {
  structure: { title: "产业需求是否成立" },
  enterprise: { title: "龙头企业是否兑现" },
  assets: { title: "资产池能否支撑产品" },
};
const PUBLIC_STRUCTURE_PENDING = new Set([
  "space",
  "power",
  "biotech",
  "longevity",
  "experience",
  "resources",
  "industrial-software",
  "cybersecurity",
  "smart-healthcare",
  "water-security",
  "climate-adaptation",
  "digital-health",
  "obesity-care",
  "mental-health",
  "sports-outdoor",
  "inbound-consumption",
  "recycling",
  "ocean-economy",
]);

function seriesChange(rows, field) {
  const values = rows.map((row) => num(row[field])).filter(Number.isFinite);
  if (values.length < 2 || !values[0]) return Number.NaN;
  return (values.at(-1) / values[0] - 1) * 100;
}

function seriesDelta(rows, field) {
  const values = rows.map((row) => num(row[field])).filter(Number.isFinite);
  return values.length >= 2 ? values.at(-1) - values[0] : Number.NaN;
}

function signedPct(value) {
  return Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
    : "—";
}
function signedPoints(value) {
  return Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}个百分点`
    : "—";
}
function yearOverYear(rows, field = "value") {
  const latest = rows.at(-1);
  if (!latest?.date) return Number.NaN;
  const [year, month] = latest.date.split("-");
  const base = rows.find((row) => row.date === `${Number(year) - 1}-${month}`);
  const current = num(latest[field]),
    previous = num(base?.[field]);
  return Number.isFinite(current) && Number.isFinite(previous) && previous
    ? (current / previous - 1) * 100
    : Number.NaN;
}

function EvidenceDrawer({ layer, item, updateTime, onClose }) {
  const [assetWindow, setAssetWindow] = useState("1y");
  const meta = evidenceMeta[layer];
  const asset = item.assets;
  const enterprise = item.enterprise;
  const structure = item.structure;
  const catalysts = structure.catalysts || [];
  const marketRows = (asset.marketHistory || []).slice(
    assetWindow === "3m" ? -65 : -300,
  );
  const enterpriseRows = [...(enterprise.history || [])].reverse();
  const structureRows = structure.history || [];
  const structureAccess =
    structure.accessStatus ||
    (structureRows.length >= 4
      ? "已自动接入"
      : PUBLIC_STRUCTURE_PENDING.has(item.id)
        ? "公开数据可接入，尚未自动化"
        : "无稳定统一免费序列");
  const structureYoy = yearOverYear(structureRows);
  const revenueNow = enterprise.revenueGrowthMedian,
    profitNow = enterprise.profitGrowthMedian;
  const enterpriseConclusion =
    revenueNow > 0 && profitNow > 0
      ? "收入和利润同步增长，产业兑现成立"
      : revenueNow > 0
        ? "收入增长但利润承压，仍需验证盈利转化"
        : "收入尚未形成增长，产业兑现不足";
  const concentration =
    asset.top10SharePercent >= 60
      ? "高度集中，产品表现容易被少数公司主导"
      : asset.top10SharePercent >= 40
        ? "集中度偏高，需要检查头部公司风险"
        : "成分分散度尚可，具备组合承载基础";
  const assetConclusion = `${asset.constituentCount || 0}只成分股、${asset.liquidConstituentCount || 0}只日成交额超过1亿元；${concentration}。`;
  const content =
    layer === "assets" ? (
      <>
        <div className="evidence-answer">
          <b>当前判断</b>
          <strong>{assetConclusion}</strong>
        </div>
        <div className="evidence-current">
          <h3>当前可投资资产池</h3>
          <div>
            <span>
              <small>全部成分股</small>
              <strong>{asset.constituentCount ?? "—"}只</strong>
            </span>
            <span>
              <small>流通市值</small>
              <strong>{yi(asset.floatMarketCapYi)}</strong>
            </span>
            <span>
              <small>日成交额</small>
              <strong>{yi(asset.dailyTurnoverYi)}</strong>
            </span>
            <span>
              <small>成交额≥1亿元</small>
              <strong>{asset.liquidConstituentCount ?? "—"}只</strong>
            </span>
            <span>
              <small>前十大占比</small>
              <strong>{pct(asset.top10SharePercent)}</strong>
            </span>
            <span>
              <small>集中度 HHI</small>
              <strong>
                {Number.isFinite(asset.hhi) ? asset.hhi.toFixed(0) : "—"}
              </strong>
            </span>
          </div>
        </div>
        <section className="asset-history">
          <header>
            <strong>板块价格与成交额趋势</strong>
            <nav>
              {[
                ["3m", "近3个月"],
                ["1y", "近1年"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  className={assetWindow === id ? "active" : ""}
                  onClick={() => setAssetWindow(id)}
                  key={id}
                >
                  {label}
                </button>
              ))}
            </nav>
          </header>
          {marketRows.length >= 2 ? (
            <>
              <div className="trend-result">
                <span>
                  板块价格变化{" "}
                  <b>{signedPct(seriesChange(marketRows, "close"))}</b>
                </span>
                <span>
                  成交额变化{" "}
                  <b>{signedPct(seriesChange(marketRows, "turnoverYi"))}</b>
                </span>
              </div>
              <MiniTrend rows={marketRows} field="close" />
              <MiniTrend rows={marketRows} field="turnoverYi" unit="亿元" />
            </>
          ) : (
            <div className="trend-missing">
              <strong>历史接口本期未返回数据</strong>
              <span>
                先看当前成分数量、流动性、集中度和前十大公司；系统同时保留每日资产快照，达到4期后显示自身变化。
              </span>
            </div>
          )}
        </section>
        <details className="top-constituents" open>
          <summary>前十大成分股 · 合计{pct(asset.top10SharePercent)}</summary>
          <div>
            <div>
              <span>排名／公司</span>
              <span>流通市值</span>
              <span>日成交额</span>
              <span>权重</span>
            </div>
            {(asset.topConstituents || []).map((row) => (
              <div key={row.code}>
                <span>
                  <i>{String(row.rank).padStart(2, "0")}</i>
                  <strong>{row.name}</strong>
                  <small>{row.code}</small>
                </span>
                <span>{yi(row.floatMarketCapYi)}</span>
                <span>{yi(row.dailyTurnoverYi)}</span>
                <b>{pct(row.weightPercent)}</b>
              </div>
            ))}
          </div>
        </details>
      </>
    ) : layer === "enterprise" ? (
      <>
        <div className="evidence-answer">
          <b>当前判断</b>
          <strong>{enterpriseConclusion}</strong>
        </div>
        <div className="evidence-current">
          <h3>
            前十大成分股财报汇总 · {enterprise.reportDate || "报告期未知"}
          </h3>
          <div>
            <span>
              <small>10家公司收入增速中位数</small>
              <strong>{pct(enterprise.revenueGrowthMedian)}</strong>
            </span>
            <span>
              <small>收入正增长公司占比</small>
              <strong>{pct(enterprise.positiveRevenueShare)}</strong>
            </span>
            <span>
              <small>10家公司利润增速中位数</small>
              <strong>{pct(enterprise.profitGrowthMedian)}</strong>
            </span>
            <span>
              <small>利润正增长公司占比</small>
              <strong>{pct(enterprise.positiveProfitShare)}</strong>
            </span>
            <span>
              <small>经营现金流／收入中位数</small>
              <strong>{pct(enterprise.cashToRevenueMedian)}</strong>
            </span>
            <span>
              <small>前十公司市值覆盖</small>
              <strong>{pct(enterprise.coveragePercent)}</strong>
            </span>
          </div>
        </div>
        <section className="asset-history">
          <header>
            <strong>
              前十大公司财报趋势 · {enterprise.history?.length || 0}个报告期
            </strong>
          </header>
          <div className="trend-result">
            <span>
              收入增速中位数变化{" "}
              <b>
                {signedPoints(
                  seriesDelta(enterpriseRows, "revenueGrowthMedian"),
                )}
              </b>
            </span>
            <span>
              利润增速中位数变化{" "}
              <b>
                {signedPoints(
                  seriesDelta(enterpriseRows, "profitGrowthMedian"),
                )}
              </b>
            </span>
          </div>
          <MiniTrend
            rows={enterpriseRows}
            field="revenueGrowthMedian"
            unit="%"
            delta
          />
          <MiniTrend
            rows={enterpriseRows}
            field="profitGrowthMedian"
            unit="%"
            delta
          />
        </section>
      </>
    ) : structureRows.length >= 4 ? (
      <>
        <div className="evidence-answer">
          <b>真实产业指标判断</b>
          <strong>
            {structure.metric}最新同比{signedPct(structureYoy)}，
            {structureYoy > 10
              ? "需求与生产活动明显扩张"
              : structureYoy > 0
                ? "产业活动温和增长"
                : "产业活动尚未扩张"}
            。
          </strong>
        </div>
        <section className="asset-history">
          <header>
            <strong>{structure.metric}</strong>
          </header>
          <div className="trend-result">
            <span>
              最新值{" "}
              <b>
                {structureRows.at(-1)?.value?.toFixed(1)}
                {structure.unit}
              </b>
            </span>
            <span>
              较上年同月 <b>{signedPct(structureYoy)}</b>
            </span>
          </div>
          <MiniTrend rows={structureRows} field="value" unit={structure.unit} />
        </section>
      </>
    ) : (
      <div className="evidence-empty">
        <b>{structureAccess}</b>
        <h3>关键验证动态</h3>
        <p>
          只保留会改变产品预研判断的订单、准入、投产、项目执行与证伪事件，不展示一般新闻和泛化财务旁证。
        </p>
        <div className="catalyst-head">
          <strong>
            {catalysts.length
              ? `近${structure.catalystWindowDays || 120}日发现 ${catalysts.length} 条有效事件`
              : `近${structure.catalystWindowDays || 120}日暂无有效验证事件`}
          </strong>
          <span>
            {structure.catalystSource || "公开公告"} · {structure.catalystStatus || "待更新"}
          </span>
        </div>
        {catalysts.length ? (
          <section className="catalyst-list">
            {catalysts.map((event, index) => (
              <article
                className={`catalyst-${event.impact}`}
                key={`${event.date}-${event.title}-${index}`}
              >
                <div>
                  <time>{event.date || "日期未知"}</time>
                  <span>{event.type}</span>
                  <b>{event.impact === "negative" ? "削弱判断" : "加强判断"}</b>
                </div>
                <strong>
                  {event.company ? `${event.company}｜` : ""}
                  {event.title}
                </strong>
                <p>验证：{event.validates}</p>
                {event.sourceUrl ? (
                  <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                    查看原公告 →
                  </a>
                ) : null}
              </article>
            ))}
          </section>
        ) : (
          <div className="catalyst-none">
            <strong>这不是“零分”</strong>
            <span>
              表示当前公开公告中尚未出现符合严格事件口径的验证信号，产业需求暂不能被确认，也不因缺失数据而强行打分。
            </span>
          </div>
        )}
      </div>
    );
  return (
    <>
      <button
        className="peer-backdrop"
        aria-label="关闭证据趋势"
        onClick={onClose}
      />
      <aside className="peer-drawer evidence-drawer" aria-label={meta.title}>
        <header>
          <div>
            <h2>{meta.title}</h2>
            <p>数据快照 {updateTime}</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        {content}
      </aside>
    </>
  );
}

function ThemeResearchPage({ item, coreRank, proof, evidence, evidenceSummary, attentionHistory, rankingHistory, externalSignals, onBack, onEvidence, onMetric }) {
  const state = windowState(item, proof);
  return <main className="theme-research-page" aria-label={`${item.name}方向详情`}>
    <header className="theme-page-header">
      <button type="button" onClick={onBack}>← 返回预研产品池</button>
      <div><small>{coreRank ? `核心10 · 核心池序位 ${coreRank}` : "36个母池方向 · 观察中"}</small><h1>{item.name}</h1><p>{item.definition}</p></div>
      <strong className={`window-${state.tone}`}>{state.label}</strong>
    </header>
    <section className="theme-page-body">
      {evidence ? <ThemeDecisionCockpit item={item} proof={proof} evidence={evidence} attentionHistory={attentionHistory} rankingHistory={rankingHistory} externalSignals={externalSignals} /> : null}
      {evidence ? <section className="theme-page-section"><header><h2>产品方向可行性</h2><p>分别验证产业需求、企业兑现与资产承载。</p></header><div className="evidence-four evidence-three theme-page-evidence">
        <button type="button" onClick={() => onEvidence("structure")}><small>产业需求是否成立</small><strong>{evidence.structure.signal}</strong><span>{evidence.structure.history?.length >= 4 ? `${evidence.structure.metric} · ${evidence.structure.history.length}期真实数据` : evidence.structure.accessStatus || "公开证据持续积累"}</span><em>查看产业趋势 →</em></button>
        <button type="button" onClick={() => onEvidence("enterprise")}><small>龙头企业是否兑现</small><strong>收入{pct(evidence.enterprise.revenueGrowthMedian)} · 利润{pct(evidence.enterprise.profitGrowthMedian)}</strong><span>前十大公司财报 · {evidence.enterprise.history?.length || 0}个报告期</span><em>查看财报结论 →</em></button>
        <button type="button" onClick={() => onEvidence("assets")}><small>资产池能否支撑产品</small><strong>{evidence.assets.constituentCount}只 · {yi(evidence.assets.floatMarketCapYi)}</strong><span>日成交{yi(evidence.assets.dailyTurnoverYi)} · 前十{pct(evidence.assets.top10SharePercent)}</span><em>查看容量和公司名单 →</em></button>
      </div><p className="evidence-source">真实产业趋势 {evidenceSummary.structureDataCount || 0}/36 · 企业财报历史 {evidenceSummary.enterpriseDataCount || 0}/36 · 当前资产池 {evidenceSummary.assetDataCount || 0}/36</p></section> : null}
      <section className="theme-page-section"><header><h2>产品空位判断</h2><p>所有规模均使用同口径可比产品，不把新基金全部规模误算为增长。</p></header><div className="decision-metrics theme-page-metrics">
        <MetricButton label="同类基金" value={`${item.market.count}只`} onClick={() => onMetric("all")} />
        <MetricButton label="近12个月新发" value={`${item.market.launched12.length}只 · ${item.market.supplyState}`} onClick={() => onMetric("12m")} />
        <MetricButton label="近90天新发" value={`${item.market.launched90.length}只`} onClick={() => onMetric("90d")} />
        <MetricButton label={`基准规模（${item.market.baselineScaleDate}）`} value={yi(item.market.baselineTotal)} onClick={() => onMetric("scale")} />
        <MetricButton label={`最新规模（${item.market.currentScaleDate}）`} value={yi(item.market.total)} onClick={() => onMetric("scale")} />
        <MetricButton label="规模净增加" value={`${signedYi(item.market.scaleIncrease)} · ${item.market.scaleState}`} onClick={() => onMetric("scale")} />
        <MetricButton label="头部产品占比" value={pct(item.market.topShare)} onClick={() => onMetric("top1")} />
        <MetricButton label="前三产品占比" value={pct(item.market.top3Share)} onClick={() => onMetric("top3")} />
        <MetricButton label="市场结论" value={item.market.state} onClick={() => onMetric("state")} />
      </div></section>
    </section>
  </main>;
}

export function PreResearchPool({ agentCommand, onContextChange }) {
  const [payload, setPayload] = useState({
    products: [],
    updateTime: "加载中",
  });
  const [evidence, setEvidence] = useState({ items: [], updateTime: "加载中" });
  const [attention, setAttention] = useState({
    recommendedIds: CORE_ATTENTION_IDS,
  });
  const [attentionHistory, setAttentionHistory] = useState({ daily: [] });
  const [externalSignals, setExternalSignals] = useState({ items: [] });
  const [selected, setSelected] = useState("");
  const [drawer, setDrawer] = useState("");
  const [evidenceLayer, setEvidenceLayer] = useState("");
  const [peerSort, setPeerSort] = useState("current");
  const [detailId, setDetailId] = useState(() => new URLSearchParams(window.location.search).get("theme") || "");
  const [reloadKey, setReloadKey] = useState(0);
  const dataVersionRef = useRef("");
  const returnScrollRef = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/fund_products.json", {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("/pre_research_evidence.json", {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("/attention_pool_evidence.json", {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("/social_attention_history.json", {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("/theme_external_signals.json", {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => r.json()),
    ])
      .then(([funds, proof, attentionProof, attentionHistoryProof, externalProof]) => {
        setPayload(funds);
        setEvidence(proof);
        setAttention(attentionProof);
        setAttentionHistory(attentionHistoryProof);
        setExternalSignals(externalProof);
        dataVersionRef.current = `${funds.updateTime || ""}|${proof.updateTime || ""}|${attentionProof.generatedAt || ""}|${externalProof.generatedAt || ""}`;
      })
      .catch(() => {});
    return () => controller.abort();
  }, [reloadKey]);
  useEffect(() => {
    const checkForUpdate = () =>
      fetchDataStatus(fetch)
        .then((status) => {
          const nextVersion = `${status.productsUpdateTime || ""}|${status.preResearchUpdateTime || ""}|${status.attentionGeneratedAt || ""}|${status.externalSignalsGeneratedAt || ""}`;
          if (dataVersionRef.current && nextVersion !== dataVersionRef.current) {
            setReloadKey((value) => value + 1);
          }
        })
        .catch(() => {});
    const interval = window.setInterval(checkForUpdate, DATA_STATUS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const evidenceById = useMemo(
    () => new Map((evidence.items || []).map((item) => [item.id, item])),
    [evidence.items],
  );
  const attentionById = useMemo(
    () => new Map((attention.items || []).map((item) => [item.id, item])),
    [attention.items],
  );
  const universe = useMemo(() => RESEARCH_UNIVERSE.map((item) => ({
    ...item,
    market: marketMetrics(item, payload.products || [], payload.updateTime),
  })), [payload]);
  const ranked = useMemo(() => {
    const priority = { 产品缺失: 4, 存在空位: 3, 继续观察: 2, 供给过剩: 1 };
    const ids =
      attention.recommendedIds?.length === 10
        ? attention.recommendedIds
        : CORE_ATTENTION_IDS;
    const coreOrder = new Map(ids.map((id, index) => [id, index]));
    return universe
      .filter((item) => coreOrder.has(item.id))
      .sort(
        (a, b) =>
          coreOrder.get(a.id) - coreOrder.get(b.id) ||
          priority[b.market.state] - priority[a.market.state],
      )
      .slice(0, 10);
  }, [attention.recommendedIds, universe]);
  const active = universe.find((item) => item.id === (detailId || selected)) || ranked[0];
  const activeEvidence = active ? evidenceById.get(active.id) : null;
  const openTheme = (id) => {
    if (!universe.some((item) => item.id === id)) return;
    if (!detailId) returnScrollRef.current = window.scrollY;
    setSelected(id);
    setDetailId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("theme", id);
    window.history[detailId ? "replaceState" : "pushState"]({ theme: id }, "", url);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const closeTheme = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("theme");
    window.history.replaceState({}, "", url);
    setDetailId("");
    requestAnimationFrame(() => window.scrollTo({ top: returnScrollRef.current, behavior: "auto" }));
  };
  useEffect(() => {
    const onPopState = () => setDetailId(new URLSearchParams(window.location.search).get("theme") || "");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!detailId) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [detailId]);
  useEffect(() => {
    if (agentCommand?.type !== 'focus-theme') return;
    const target = universe.find((item) => item.id === agentCommand.themeId || item.name === agentCommand.themeName);
    if (!target) return;
    openTheme(target.id);
  }, [agentCommand, universe]);
  useEffect(() => {
    if (!active) return;
    const coreRank = ranked.findIndex((item) => item.id === active.id);
    onContextChange?.({ selectedTheme: { id: active.id, name: active.name, rank: coreRank >= 0 ? coreRank + 1 : null, universe: coreRank >= 0 ? "核心10" : "36个母池", marketState: active.market.state, peerCount: active.market.count, newFunds12m: active.market.launched12.length, scaleNetIncreaseYi: Number(active.market.scaleIncrease.toFixed(1)) }, drawer, evidenceLayer });
  }, [active, drawer, evidenceLayer, onContextChange, ranked]);
  const drawerFunds = useMemo(() => {
    if (!active) return [];
    const base =
      drawer === "12m"
        ? active.market.launched12
        : drawer === "90d"
          ? active.market.launched90
          : drawer === "top1"
            ? active.market.peers.slice(0, 1)
            : drawer === "top3"
              ? active.market.peers.slice(0, 3)
              : active.market.peers;
    return [...base].sort((a, b) =>
      peerSort === "growth"
        ? sortable(fundGrowth(b)) - sortable(fundGrowth(a))
        : sortable(num(b.currentScaleYi)) - sortable(num(a.currentScaleYi)),
    );
  }, [active, drawer, peerSort]);

  return (
    <main className={`workspace-main research-pool decision-mode${detailId ? " theme-page-open" : ""}`}>
      {detailId && active ? (
        <ThemeResearchPage
          item={active}
          coreRank={ranked.findIndex((item) => item.id === active.id) + 1 || null}
          proof={attentionById.get(active.id)}
          evidence={activeEvidence}
          evidenceSummary={evidence}
          attentionHistory={attentionHistory}
          rankingHistory={attention.rankingHistory || []}
          externalSignals={(externalSignals.items || []).find((item) => item.id === active.id)}
          onBack={closeTheme}
          onEvidence={setEvidenceLayer}
          onMetric={setDrawer}
        />
      ) : null}
      <header className="decision-hero">
        <div>
          <h1>核心预研产品池</h1>
          <p>每季度重排 · 不等同未来三个月预测</p>
        </div>
        <div className="research-data-date">
          <small>数据日期</small>
          <strong>{String(payload.updateTime || "—").slice(0, 10)}</strong>
        </div>
      </header>
      <ResearchHorizonBrief
        snapshot={attention}
        evidenceItems={evidence.items || []}
        externalItems={externalSignals.items || []}
        productIds={ranked.map((item) => item.id)}
        onOpen={openTheme}
      />
      <AttentionHeatmap
        focusId={detailId}
        externalSignals={externalSignals.items || []}
        productIds={ranked.map((item) => item.id)}
        snapshot={attention}
        onSelectCore={openTheme}
      />
      {drawer && active && (
        <>
          <button
            className="peer-backdrop"
            aria-label="关闭指标依据"
            onClick={() => setDrawer("")}
          />
          <aside className="peer-drawer" aria-label="产品空位指标依据">
            <header>
              <div>
                <small>{active.name}</small>
                <h2>
                  {
                    {
                      all: "全部同类基金",
                      "12m": "近12个月新发",
                      "90d": "近90天新发",
                      scale: "规模变化明细",
                      top1: "头部产品占比",
                      top3: "前三产品占比",
                      state: "市场结论依据",
                    }[drawer]
                  }
                </h2>
                <p>数据快照 {payload.updateTime}</p>
              </div>
              <div className="peer-head-actions">
                {drawer !== "state" ? (
                  <select
                    aria-label="同类基金排序"
                    value={peerSort}
                    onChange={(event) => setPeerSort(event.target.value)}
                  >
                    <option value="current">当前规模 ↓</option>
                    <option value="growth">规模增幅 ↓</option>
                  </select>
                ) : null}
                <button type="button" onClick={() => setDrawer("")}>
                  关闭
                </button>
              </div>
            </header>
            {drawer === "state" ? (
              <div className="state-explain">
                <strong>{active.market.state}</strong>
                <div className="conclusion-axis">
                  <div>
                    <small>新增供给</small>
                    <b>{active.market.supplyState}</b>
                    <p>
                      近12个月 {active.market.launched12.length}只，近90天{" "}
                      {active.market.launched90.length}只。
                    </p>
                  </div>
                  <div>
                    <small>规模变化</small>
                    <b>{active.market.scaleState}</b>
                    <p>
                      可比规模 {signedYi(active.market.scaleIncrease)}，变化率{" "}
                      {pct(active.market.scaleGrowth)}。
                    </p>
                  </div>
                </div>
                <ul>
                  <li>产品少于8只，判断为“产品缺失”。</li>
                  <li>产品超过35只且新增拥挤，判断为“供给过剩”。</li>
                  <li>新增稀少但可比规模扩张，判断为“存在空位”。</li>
                  <li>其余情况为“继续观察”。</li>
                </ul>
              </div>
            ) : (
              <div className="peer-table peer-table--scale">
                <div>
                  <span>基金产品</span>
                  <span>代码</span>
                  <span>基准规模</span>
                  <span>当前规模</span>
                  <span>增加额</span>
                  <span>规模增幅</span>
                </div>
                {drawerFunds.map((fund) => (
                  <div key={fund.productId}>
                    <strong>{fund.productName}</strong>
                    <span>{fund.representativeCode}</span>
                    <span>{yi(num(fund.baselineScaleYi))}</span>
                    <span>{yi(num(fund.currentScaleYi))}</span>
                    <span
                      className={
                        (num(fund.scaleNetIncreaseYi) || 0) >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {signedYi(num(fund.scaleNetIncreaseYi))}
                    </span>
                    <span
                      className={
                        (fundGrowth(fund) || 0) >= 0 ? "positive" : "negative"
                      }
                    >
                      {Number.isFinite(fundGrowth(fund))
                        ? `${fundGrowth(fund) >= 0 ? "+" : ""}${fundGrowth(fund).toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </>
      )}
      {evidenceLayer && activeEvidence ? (
        <EvidenceDrawer
          layer={evidenceLayer}
          item={activeEvidence}
          updateTime={evidence.updateTime}
          onClose={() => setEvidenceLayer("")}
        />
      ) : null}
    </main>
  );
}
