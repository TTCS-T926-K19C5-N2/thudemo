param([ValidateSet('api','web')][string]$Mode)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
Set-Location $taskRoot
$taskConfig=Get-Content -LiteralPath (Join-Path $taskRoot '.sprint1-local/config.json') -Raw | ConvertFrom-Json
foreach ($taskVariable in @('DATABASE_URL','REDIS_URL','REDIS_HOST','REDIS_PORT','AUTH_PROXY_SECRET','SCANNER_KEY_ID','SCANNER_SIGNING_PRIVATE_KEY','SCANNER_SIGNING_PRIVATE_KEY_FILE','SCANNER_PUBLIC_KEYS','SCANNER_PUBLIC_KEY','PORT','WEB_PORT','WEB_ORIGIN','API_INTERNAL_URL','PAYMENT_GATEWAY','PAYMENT_WEBHOOK_SECRET','NODE_ENV','APP_ENV','HOLD_EXPIRY_MODE','ORDER_EXPIRY_MODE')) { Remove-Item "Env:$taskVariable" -ErrorAction SilentlyContinue }
if ($Mode -eq 'api') {
  Set-Location (Join-Path $taskRoot 'apps/api')
  & node --env-file=../../.env dist/main.js
} else {
  $env:API_INTERNAL_URL="http://127.0.0.1:$($taskConfig.apiPort)"
  $env:PORT="$($taskConfig.webPort)"
  $env:NODE_ENV='production'
  Set-Location (Join-Path $taskRoot 'apps/web')
  & node --env-file=../../.env server.mjs
}
exit $LASTEXITCODE
