$ErrorActionPreference = 'Stop'

$themes = @(
  @{ id='ai-agent'; board='BK0800'; structure='人工智能+与智能体进入产业化阶段'; source='国家规划 / 东方财富公开板块' },
  @{ id='embodied-ai'; board='BK1184'; structure='机器人从自动化设备向通用劳动力演进'; source='国家规划 / 东方财富公开板块' },
  @{ id='space'; board='BK0963'; structure='卫星组网与商业发射形成基础设施需求'; source='国家规划 / 东方财富公开板块' },
  @{ id='power'; board='BK1647'; structure='新能源与算力共同提高电网投资需求'; source='国家能源局 / 东方财富公开板块' },
  @{ id='hard-tech'; board='BK0917'; structure='关键生产工具与核心器件国产替代'; source='国家规划 / 东方财富公开板块' },
  @{ id='biotech'; board='BK1106'; structure='创新药授权出海与多元支付逐步兑现'; source='国家规划 / 东方财富公开板块' },
  @{ id='longevity'; board='BK0653'; structure='老龄人口扩大健康、照护与服务需求'; source='国家统计局 / 东方财富公开板块' },
  @{ id='experience'; board='BK1652'; structure='消费由商品拥有向服务与体验迁移'; source='消费政策 / 东方财富公开板块' },
  @{ id='resources'; board='BK0523'; structure='能源转型与供应链安全强化材料约束'; source='国家规划 / 东方财富公开板块' },
  @{ id='future-tech'; board='BK0710'; structure='量子等未来技术进入工程验证窗口'; source='国家规划 / 东方财富公开板块' },
  @{ id='industrial-software'; board='BK0696'; structure='制造业数字化提高工业软件自主需求'; source='工信部 / 东方财富公开板块' },
  @{ id='ai-application'; board='BK0579'; structure='AI价值链由算力建设向应用收入扩散'; source='国家规划 / 东方财富公开板块' }
)

$items = foreach ($theme in $themes) {
  $fields = 'f57%2Cf58%2Cf116%2Cf117%2Cf162%2Cf168'
  $url = "https://push2.eastmoney.com/api/qt/stock/get?secid=90.$($theme.board)&fields=$fields"
  try { $data = (Invoke-RestMethod -Uri $url -TimeoutSec 25).data } catch { $data = $null }
  [ordered]@{
    id = $theme.id
    structure = [ordered]@{ signal=$theme.structure; source=$theme.source; type='结构证据' }
    enterprise = [ordered]@{ proxy='板块市盈率'; value=if ($data -and $data.f162) { [math]::Round($data.f162/100,1) } else { $null }; status='代理指标'; note='首版仅作企业盈利估值代理，不等同于收入兑现' }
    assets = [ordered]@{
      boardCode=$theme.board; boardName=if ($data) {$data.f58} else {$null}
      totalMarketCapYi=if ($data) {[math]::Round($data.f116/100000000,1)} else {$null}
      floatMarketCapYi=if ($data) {[math]::Round($data.f117/100000000,1)} else {$null}
      floatRatio=if ($data -and $data.f116) {[math]::Round($data.f117/$data.f116*100,1)} else {$null}
      source='东方财富公开板块行情'; status=if ($data) {'真实数据'} else {'获取失败'}
    }
  }
}

$peValues = @($items | ForEach-Object { $_.enterprise.value } | Where-Object { $null -ne $_ } | Sort-Object)
if ($peValues.Count) {
  $middle = [math]::Floor($peValues.Count / 2)
  $medianPe = if ($peValues.Count % 2) { [double]$peValues[$middle] } else { ([double]$peValues[$middle-1] + [double]$peValues[$middle]) / 2 }
  foreach ($item in $items) {
    if ($null -eq $item.enterprise.value) { continue }
    $pe = [double]$item.enterprise.value
    $relative = [math]::Round(($pe / $medianPe - 1) * 100, 1)
    $rank = 1 + @($peValues | Where-Object { $_ -gt $pe }).Count
    $item.enterprise['peerMedian'] = [math]::Round($medianPe, 1)
    $item.enterprise['relativeToMedian'] = $relative
    $item.enterprise['rank'] = "$rank/$($peValues.Count)"
    $item.enterprise['level'] = if ($relative -gt 25) { '相对偏高' } elseif ($relative -lt -25) { '相对偏低' } else { '中位附近' }
    $item.enterprise.note = '与本候选池代表板块横向比较；不是历史估值分位'
  }
}

$output = [ordered]@{ updateTime=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss'); methodologyVersion='v1-free-public-data'; items=$items }
$path = Join-Path $PSScriptRoot '..\public\pre_research_evidence.json'
$output | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8
Write-Output "updated $path"
