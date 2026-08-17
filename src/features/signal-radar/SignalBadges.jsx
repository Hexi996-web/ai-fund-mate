const demand = { direct: '真实客需', proxy: '需求代理', media_attention: '媒体热度', unknown: '客需待验证' }
export function SignalBadges({ signal }) {
  const pending = signal.validationStatus === 'pending_official_validation'
  return <span className="signal-badges">
    <i className={`demand demand--${signal.demandKind}`}>{demand[signal.demandKind] ?? demand.unknown}</i>
    <i>信源 {Math.round((signal.sourceConfidence ?? 0) * 100)}%</i>
    {pending ? <i className="validation-warning">待官方验证</i> : null}
  </span>
}
