const score = (value) => Number.isFinite(Number(value)) ? Number(value) : null

export function windowState(item, proof) {
  const attention = score(proof?.attention?.score)
  const demand = score(proof?.validation?.score)
  const capacity = score(proof?.capacity?.score)
  const crowded = item.market.state === '供给过剩' || item.market.launched12.length > 10
  const shrinking = item.market.scaleGrowth < -10

  if (crowded && demand >= 55) return { label: '已拥挤', tone: 'crowded', action: '方向仍成立，但优先寻找细分表达，避免同质化。' }
  if (shrinking && attention < 35) return { label: '窗口关闭', tone: 'closed', action: '注意力与产品需求同时转弱，暂缓新增预研。' }
  if (attention >= 55 && demand >= 55 && capacity >= 55 && !crowded) return { label: '窗口开启', tone: 'open', action: '三项证据形成共振，可提高预研优先级。' }
  if (demand >= 50 && capacity >= 50 && !crowded) return { label: '窗口临近', tone: 'near', action: '产品需求与资产承载已具备，等待注意力持续扩散。' }
  if ((attention ?? 0) >= 35 || (demand ?? 0) >= 35) return { label: '预研', tone: 'research', action: '保留观察，等待第二层证据确认。' }
  return { label: '太早', tone: 'early', action: '信号尚弱，只记录假设，不进入产品准备。' }
}
