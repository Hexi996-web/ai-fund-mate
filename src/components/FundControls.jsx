export const FUND_CATEGORIES = [
  '全部',
  '股票型',
  '混合型',
  '债券型',
  '货币市场',
  'FOF',
  '其他',
]

export const SORT_OPTIONS = [
  { value: 'default', label: '默认顺序' },
  { value: 'change-desc', label: '日涨跌幅：从高到低' },
  { value: 'change-asc', label: '日涨跌幅：从低到高' },
  { value: 'nav-desc', label: '单位净值：从高到低' },
  { value: 'nav-asc', label: '单位净值：从低到高' },
  { value: 'scale-desc', label: '估算规模：从大到小' },
  { value: 'scale-asc', label: '估算规模：从小到大' },
  { value: 'date-desc', label: '净值日期：从新到旧' },
  { value: 'date-asc', label: '净值日期：从旧到新' },
  { value: 'code-asc', label: '基金代码：升序' },
  { value: 'code-desc', label: '基金代码：降序' },
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

function FundToolbar({ sortMode, hasDateData, viewMode, onSortModeChange, onViewModeChange, disabled }) {
  const availableSortOptions = hasDateData
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((option) => !option.value.startsWith('date-'))

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
          {availableSortOptions.map((option) => (
            <option value={option.value} key={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="view-switch" role="group" aria-label="基金视图">
        <button
          type="button"
          className={viewMode === 'list' ? 'view-switch__button view-switch__button--active' : 'view-switch__button'}
          aria-pressed={viewMode === 'list'}
          onClick={() => onViewModeChange('list')}
          disabled={disabled}
        >
          列表
        </button>
        <button
          type="button"
          className={viewMode === 'card' ? 'view-switch__button view-switch__button--active' : 'view-switch__button'}
          aria-pressed={viewMode === 'card'}
          onClick={() => onViewModeChange('card')}
          disabled={disabled}
        >
          卡片
        </button>
      </div>
    </div>
  )
}

export function FundControls({
  query,
  category,
  sortMode,
  hasDateData,
  viewMode,
  onQueryChange,
  onCategoryChange,
  onSortModeChange,
  onViewModeChange,
  disabled = false,
}) {
  return (
    <section className="fund-controls" aria-label="基金搜索与筛选">
      <SearchBar query={query} onQueryChange={onQueryChange} disabled={disabled} />
      <div className="controls-row">
        <CategoryFilters category={category} onCategoryChange={onCategoryChange} disabled={disabled} />
        <FundToolbar
          sortMode={sortMode}
          hasDateData={hasDateData}
          viewMode={viewMode}
          onSortModeChange={onSortModeChange}
          onViewModeChange={onViewModeChange}
          disabled={disabled}
        />
      </div>
    </section>
  )
}
