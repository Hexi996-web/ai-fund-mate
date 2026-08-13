export const MARKET_REGIME = [
  { id: 'growth', label: '增长', state: '稳中偏弱', tone: 'negative', observedAt: '2026-06-30', evidenceType: 'official' },
  { id: 'inflation', label: '通胀', state: '低位运行', tone: 'neutral', observedAt: '2026-06-30', evidenceType: 'official' },
  { id: 'liquidity', label: '流动性', state: '合理充裕', tone: 'positive', observedAt: '2026-06-30', evidenceType: 'official' },
  { id: 'risk', label: '风险偏好', state: '结构分化', tone: 'neutral', observedAt: '2026-08-08', evidenceType: 'proxy' },
  { id: 'valuation', label: '估值', state: '中位分化', tone: 'neutral', observedAt: '2026-08-08', evidenceType: 'proxy' },
]

export const SIGNALS = [
  {
    id: 'policy-equity-funds', category: 'policy', title: '中长期资金入市导向延续',
    summary: '政策持续强调提高中长期资金实际投资比例，权益产品供给需更关注持有体验。',
    importance: 'high', direction: 'positive', horizon: 'long', evidenceType: 'official',
    publishedAt: '2025-01-22', effectiveAt: '2025-01-22', observedAt: '2025-01-22', validThrough: '2027-12-31',
    sourceName: '中国证监会', sourceUrl: 'https://www.csrc.gov.cn/csrc/c100028/c7538170/content.shtml', sourceNote: '官方政策文件，需按后续配套规则更新。',
    affectedAssets: ['A股宽基', '红利低波', '权益FOF'], relatedFundKeywords: ['中证500', '红利低波', '持有期'], themes: ['long-term-equity'],
    fact: '官方文件就推动中长期资金入市作出部署。',
    interpretation: '产品端的机会不只是增加权益供给，还包括围绕低波动、定投和持有期的体验设计。',
    transmission: ['政策鼓励中长期资金', '权益配置需求的稳定性提升', '低成本、可长期持有工具受关注'],
    counterEvidence: ['资金实际入市节奏可能慢于政策表述。'], invalidationConditions: ['后续配套机制未落地或权益配置约束显著收紧。'], recommendedAction: '进入权益持有体验专题研究。',
  },
  {
    id: 'policy-fund-fees', category: 'policy', title: '公募基金费率机制持续优化', summary: '降费与浮动费率机制提高产品定价透明度的重要性。',
    importance: 'high', direction: 'neutral', horizon: 'long', evidenceType: 'official', publishedAt: '2025-05-07', effectiveAt: '2025-05-07', observedAt: '2025-05-07', validThrough: '2027-12-31',
    sourceName: '中国证监会', sourceUrl: 'https://www.csrc.gov.cn/csrc/c100028/c7555864/content.shtml', sourceNote: '官方公开信息。', affectedAssets: ['主动权益基金', '指数基金'], relatedFundKeywords: ['浮动费率', '低费率'], themes: ['fee-experience'],
    fact: '公募基金高质量发展行动方案强调投资者回报和费率机制优化。', interpretation: '差异化需从费率数字上升为费率与业绩、持有期和服务的一致性。',
    transmission: ['费率改革', '产品定价和利益绑定要求上升', '浮动费率与低成本产品机会'], counterEvidence: ['单纯降费容易加剧同质化。'], invalidationConditions: ['目标客群对机制不理解或运营无法支持。'], recommendedAction: '比较同类费率与客户体验。',
  },
  {
    id: 'macro-liquidity', category: 'macro', title: '低利率环境支持多资产配置需求', summary: '货币环境偏宽松，现金替代与稳健多资产的配置价值提升。',
    importance: 'high', direction: 'positive', horizon: 'medium', evidenceType: 'official', publishedAt: '2026-08-11', observedAt: '2026-06-30', validThrough: '2026-09-30', sourceName: '中国人民银行', sourceUrl: 'https://www.pbc.gov.cn/zhengcehuobisi/125207/125227/125957/index.html', sourceNote: '样本基于官方货币政策报告入口，数据日与发布日分开。', affectedAssets: ['中短债', '固收+', '多资产'], relatedFundKeywords: ['固收+', '多资产', '中短债'], themes: ['multi-asset'],
    fact: '官方货币政策报告持续关注保持流动性合理充裕。', interpretation: '存款收益中枢下移时，客户需要的往往不是单一资产高收益，而是可理解的回撤控制。', transmission: ['利率中枢偏低', '传统现金收益降低', '稳健多资产需求上升'], counterEvidence: ['利率快速反弹将压低债券产品持有体验。'], invalidationConditions: ['流动性明显收紧。'], recommendedAction: '测试不同回撤预算的多资产结构。',
  },
  {
    id: 'macro-demand', category: 'macro', title: '内需修复仍需数据验证', summary: '增长动能分化，主题产品不宜仅依赖总量复苏叙事。',
    importance: 'medium', direction: 'neutral', horizon: 'medium', evidenceType: 'official', publishedAt: '2026-07-15', observedAt: '2026-06-30', validThrough: '2026-09-30', sourceName: '国家统计局', sourceUrl: 'https://www.stats.gov.cn/sj/', sourceNote: '官方统计数据入口。', affectedAssets: ['消费', '顺周期', '宽基'], relatedFundKeywords: ['消费', '沪深300'], themes: ['long-term-equity'], fact: '宏观数据显示部分需求指标仍有分化。', interpretation: '产品立项应设置业绩和需求验证点，而不是把宏观口号直接转为行业产品。', transmission: ['需求修复分化', '行业景气分化', '主题产品需强化筛选'], counterEvidence: ['政策加码可能加快修复。'], invalidationConditions: ['多项需求数据连续改善。'], recommendedAction: '维持观察，等待连续数据验证。',
  },
  {
    id: 'market-dividend', category: 'market', title: '红利低波交易拥挤度需跟踪', summary: '稳健风格需求延续，但近期相对表现只能作为需求代理。', importance: 'high', direction: 'neutral', horizon: 'short', evidenceType: 'proxy', publishedAt: '2026-08-08', observedAt: '2026-08-08', validThrough: '2026-08-31', sourceName: '项目市场快照', sourceUrl: '', sourceNote: '免费行情代理；不代表真实客户需求或未来收益。', affectedAssets: ['红利低波', '央企红利'], relatedFundKeywords: ['红利', '低波', '央企'], themes: ['long-term-equity'], fact: '免费市场代理指标显示稳健风格仍获关注。', interpretation: '如果同类产品供给已高度拥挤，新产品必须在指数编制、费率或持有体验上有真差异。', transmission: ['风险偏好分化', '稳健因子受关注', '同类供给与拥挤风险同时上升'], counterEvidence: ['风格反转可使近期需求迅速降温。'], invalidationConditions: ['估值与持仓拥挤度进入历史高位。'], recommendedAction: '先完成全市场同类产品地图。',
  },
  {
    id: 'market-ai', category: 'market', title: 'AI主题强度与估值出现分化', summary: '主题关注度较高，但产品化前需区分长期产业趋势与短期交易热度。', importance: 'medium', direction: 'positive', horizon: 'medium', evidenceType: 'public', publishedAt: '2026-08-08', observedAt: '2026-08-08', validThrough: '2026-08-31', sourceName: '公开指数行情样本', sourceUrl: 'https://www.csindex.com.cn/', sourceNote: '公开指数入口；页面样本不提供实时交易建议。', affectedAssets: ['AI算力', '数字经济'], relatedFundKeywords: ['人工智能', '算力', '数字经济'], themes: ['ai-product'], fact: '公开行情中AI相关指数表现分化。', interpretation: '更合适的产品研究是比较不同产业链暴露和指数纯度，而非追逐单日涨幅。', transmission: ['产业投资预期', '产业链盈利分化', '精细化指数工具需求'], counterEvidence: ['估值过快扩张或盈利验证不及预期。'], invalidationConditions: ['主题成交热度骤降且盈利预期下修。'], recommendedAction: '建立AI主题指数成分与纯度对比。',
  },
  {
    id: 'customer-steady', category: 'customer', title: '稳健低波产品关注度上升', summary: '基金份额与同类产品关注只作为需求代理，仍需渠道访谈验证。', importance: 'high', direction: 'positive', horizon: 'medium', evidenceType: 'proxy', publishedAt: '2026-08-08', observedAt: '2026-08-08', validThrough: '2026-08-31', sourceName: '免费公开基金数据', sourceUrl: '', sourceNote: '需求代理：不是客户访谈、订单意向或真实风险偏好数据。', affectedAssets: ['短债', '固收+', '红利低波'], relatedFundKeywords: ['低波', '持有期', '固收+'], themes: ['multi-asset'], fact: '公开基金份额和产品关注可用作需求方向的弱代理。', interpretation: '真正的客户需求必须由销售、客服和渠道访谈补足，当前只能立为待验证假设。', transmission: ['低利率与回撤敏感', '稳健产品关注上升', '待验证的稳健多资产机会'], counterEvidence: ['份额变化可能由渠道推广或短期业绩驱动。'], invalidationConditions: ['渠道访谈未发现持续需求。'], recommendedAction: '发起渠道与销售访谈，验证最大可承受回撤。',
  },
  {
    id: 'customer-fee', category: 'customer', title: '客户对低费率与透明机制的偏好待验证', summary: '本条为演示调研假设，用于展示未来内部数据接入位置。', importance: 'medium', direction: 'positive', horizon: 'long', evidenceType: 'demo', publishedAt: '2026-08-01', observedAt: '2026-08-01', validThrough: '2026-08-31', sourceName: '演示数据', sourceUrl: '', sourceNote: '演示：未接入真实客户调研、销售或客服数据。', affectedAssets: ['低费率指数基金', '浮动费率产品'], relatedFundKeywords: ['低费率', '浮动费率'], themes: ['fee-experience'], fact: '当前没有可用的真实客户调研数据。', interpretation: '可将费率理解、持有期和业绩费率联动设为后续调研题目。', transmission: ['费率改革', '产品机制变化', '需要真实客户理解度测试'], counterEvidence: ['客户可能更关心短期业绩而非费率机制。'], invalidationConditions: ['真实调研不支持该假设。'], recommendedAction: '设计客户访谈问卷，不进入立项评分。',
  },
]

export const OPPORTUNITY_THEMES = [
  { id: 'long-term-equity', title: '长钱入市与权益持有体验', confidence: '中高', action: '深入研究', signalIds: ['policy-equity-funds', 'market-dividend'], counterSignalIds: ['macro-demand'], invalidationCondition: '实际中长期资金入市节奏显著低于预期。' },
  { id: 'multi-asset', title: '低利率下的稳健多资产', confidence: '中', action: '验证客需', signalIds: ['macro-liquidity', 'customer-steady'], counterSignalIds: [], invalidationCondition: '渠道访谈未验证回撤受限客群的持续需求。' },
  { id: 'fee-experience', title: '费率机制与客户体验', confidence: '中', action: '补充调研', signalIds: ['policy-fund-fees', 'customer-fee'], counterSignalIds: [], invalidationCondition: '真实客户研究显示费率机制不影响选择。' },
  { id: 'ai-product', title: 'AI产业链精细化工具', confidence: '中低', action: '等待验证', signalIds: ['market-ai'], counterSignalIds: [], invalidationCondition: '产业盈利验证不及预期或同类产品已过度拥挤。' },
]
