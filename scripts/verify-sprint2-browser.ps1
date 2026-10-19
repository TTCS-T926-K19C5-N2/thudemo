$ErrorActionPreference='Stop'
if (!$env:SPRINT2_DEMO_PASSWORD) { throw 'Set SPRINT2_DEMO_PASSWORD for local fake accounts' }
$taskRoot=(Split-Path $PSScriptRoot).Replace('\','/')
$taskCode=Get-Content -Raw -LiteralPath "$PSScriptRoot/sprint2-browser-flow.js"
$taskCode=$taskCode.Replace('__TASK_ROOT__',($taskRoot | ConvertTo-Json -Compress)).Replace('__DEMO_PASSWORD__',($env:SPRINT2_DEMO_PASSWORD | ConvertTo-Json -Compress))
$taskTemporary="$taskRoot/.git/sprint2-browser-run.js"
Set-Content -LiteralPath $taskTemporary -Value $taskCode
try {
  Push-Location $taskRoot
  npx --yes --package @playwright/cli playwright-cli -s=sang-sprint2 run-code --filename $taskTemporary --raw 2>&1 | Set-Content -LiteralPath "$taskRoot/evidence/sprint2/20261004-local/browser-report.json"
  if ($LASTEXITCODE -ne 0) { throw 'Browser verification failed; inspect report' }
} finally { Pop-Location; Remove-Item -LiteralPath $taskTemporary }
