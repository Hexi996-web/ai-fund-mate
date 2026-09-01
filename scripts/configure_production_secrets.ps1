$ErrorActionPreference = 'Stop'

$ServerHost = '47.94.233.5'
$ServerUser = 'admin'
$SshKey = Join-Path $HOME '.ssh\ai-fund-mate-ecs'

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$zhipuSecure = Read-Host 'New Zhipu API key' -AsSecureString
$databaseSecure = Read-Host 'Supabase IPv4 Session pooler URI (port 5432)' -AsSecureString
$zhipuKey = ConvertFrom-SecureValue $zhipuSecure
$databaseUrl = ConvertFrom-SecureValue $databaseSecure

try {
  $uri = [Uri]$databaseUrl
  $expectedPoolerUser = 'postgres.rxltxbnsvoognoykmkop'
  if ($uri.Scheme -notin @('postgres', 'postgresql') -or
      -not $uri.Host.EndsWith('.pooler.supabase.com') -or
      $uri.Port -ne 5432 -or
      $uri.UserInfo.Split(':')[0] -ne $expectedPoolerUser) {
    throw "Database URI must be the Supabase IPv4 Session pooler on port 5432 with user $expectedPoolerUser."
  }
  if (-not (Test-Path -LiteralPath $SshKey)) { throw "SSH key not found: $SshKey" }

  $databaseUrl | gh secret set SUPABASE_DB_URL --repo Hexi996-web/ai-fund-mate
  if ($LASTEXITCODE -ne 0) { throw 'Failed to update GitHub secret SUPABASE_DB_URL.' }
  "$zhipuKey`n$databaseUrl" | ssh -T -i $SshKey "$ServerUser@$ServerHost" '/home/admin/configure-ai-fund-mate-secrets.sh'
  if ($LASTEXITCODE -ne 0) { throw 'Failed to update production server secrets.' }
  Write-Host 'Production secrets updated in GitHub Actions and on the server.'
} finally {
  $zhipuKey = $null
  $databaseUrl = $null
  $zhipuSecure.Dispose()
  $databaseSecure.Dispose()
}
