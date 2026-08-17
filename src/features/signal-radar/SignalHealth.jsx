const fmt = (value) => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '尚无'

export function SignalHealth({ state, snapshot, error }) {
  if (state === 'loading') return <div className="signal-health signal-health--loading" role="status">正在同步公开信号…</div>
  if (state === 'error') return <div className="signal-health signal-health--error" role="alert">信号数据暂时不可用：{error?.message}</div>
  const stale = state === 'stale'
  return <div className={`signal-health ${stale ? 'signal-health--stale' : 'signal-health--ready'}`} role="status">
    <span><b>{stale ? '数据已过期' : '数据已更新'}</b> · 最后更新 {fmt(snapshot?.generatedAt)}</span>
    <span>{snapshot?.health?.signalCount ?? snapshot?.signals?.length ?? 0} 条信号 · {snapshot?.health?.catalystCount ?? snapshot?.catalysts?.length ?? 0} 个催化剂</span>
  </div>
}
