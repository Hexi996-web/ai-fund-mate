const CATEGORIES = [['all', '全部'], ['policy', '政策'], ['macro', '宏观'], ['market', '市场'], ['customer', '客户代理']]

export function SignalFilters({ filters, onChange }) {
  return (
    <div className="signal-filterbar">
      <div className="signal-category-filters" aria-label="信号分类">
        {CATEGORIES.map(([value, label]) => <button key={value} type="button" className={filters.category === value ? 'is-active' : ''} onClick={() => onChange({ ...filters, category: value })}>{label}</button>)}
      </div>
      <label>重要性<select value={filters.importance} onChange={(event) => onChange({ ...filters, importance: event.target.value })}><option value="all">全部</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
      <label>证据<select value={filters.evidenceType} onChange={(event) => onChange({ ...filters, evidenceType: event.target.value })}><option value="all">全部</option><option value="official">官方</option><option value="public">公开</option><option value="proxy">代理</option><option value="demo">演示</option></select></label>
      <label>客需<select value={filters.demandKind} onChange={(event) => onChange({ ...filters, demandKind: event.target.value })}><option value="all">全部</option><option value="direct">真实客需</option><option value="proxy">客需代理</option><option value="media_attention">媒体热度</option><option value="unknown">待验证</option></select></label>
    </div>
  )
}
