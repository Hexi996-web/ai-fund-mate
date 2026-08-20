export const FUND_CATEGORIES = [
  '全部',
  '股票型',
  '混合型',
  '债券型',
  '货币型',
  'QDII',
  'FOF',
  '指数型',
  '商品',
  'REITs',
]

export const SORT_OPTIONS = [
  { value: 'scale-desc', label: '当前规模 ↓' },
  { value: 'scale-net-desc', label: '规模净增额 ↓' },
  { value: 'scale-growth-desc', label: '规模增长率 ↓' },
  { value: 'nav-growth-desc', label: '净值增长 ↓' },
  { value: 'drawdown-desc', label: '最大回撤（较优）' },
]

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.2 4.2" />
    </svg>
  )
}

function SearchBar({ query, onQueryChange, disabled }) {
  return (
    <label className="search-box">
      <span className="sr-only">搜索基金名称或代码</span>
      <SearchIcon />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="搜索基金名称或代码"
        disabled={disabled}
      />
      {query ? (
        <button type="button" onClick={() => onQueryChange('')} aria-label="清空搜索">
          清除
        </button>
      ) : null}
    </label>
  )
}

function CategoryFilters({ category, onCategoryChange, disabled }) {
  return (
    <fieldset className="category-filters" disabled={disabled}>
      <legend className="sr-only">按基金类型筛选</legend>
      {FUND_CATEGORIES.map((item) => (
        <button
          type="button"
          className={category === item ? 'category-filter category-filter--active' : 'category-filter'}
          aria-pressed={category === item}
          onClick={() => onCategoryChange(item)}
          key={item}
        >
          {item}
        </button>
      ))}
    </fieldset>
  )
}

function FundToolbar({ sortMode, onSortModeChange, disabled }) {
  return (
    <div className="fund-toolbar">
      <label className="sort-control">
        <span>排序</span>
        <select
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value)}
          disabled={disabled}
          aria-label="基金排序方式"
        >
          {SORT_OPTIONS.map((option) => (
            <option value={option.value} key={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

export function FundControls({
  query,
  category,
  sortMode,
  onQueryChange,
  onCategoryChange,
  onSortModeChange,
  disabled = false,
}) {
  return (
    <section className="fund-controls" aria-label="基金搜索与筛选">
      <SearchBar query={query} onQueryChange={onQueryChange} disabled={disabled} />
      <div className="controls-row">
        <CategoryFilters category={category} onCategoryChange={onCategoryChange} disabled={disabled} />
        <FundToolbar
          sortMode={sortMode}
          onSortModeChange={onSortModeChange}
          disabled={disabled}
        />
      </div>
    </section>
  )
}
