param([string]$Session='showseat-fidelity', [ValidateSet('http://localhost:3000','http://localhost:3100')][string]$BaseUrl='http://localhost:3000', [ValidateSet('stitch-correction/20261004','render-free/20261004','holds/20261004','stitch-official/20261004')][string]$Run='stitch-correction/20261004')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
if(!$env:SPRINT2_DEMO_PASSWORD){throw 'Set the same local synthetic account password used by the fidelity seed.'}
Push-Location $taskRoot
try {
  $taskCode=Get-Content -Raw -LiteralPath 'scripts/correction-browser-flow.js'
  $taskRootJson=ConvertTo-Json -Compress -InputObject $taskRoot.Replace('\','/')
  $taskPasswordJson=ConvertTo-Json -Compress -InputObject $env:SPRINT2_DEMO_PASSWORD
  $taskBaseJson=ConvertTo-Json -Compress -InputObject $BaseUrl
  $taskCaptureJson=ConvertTo-Json -Compress -InputObject "/evidence/$Run/after/"
  New-Item -ItemType Directory -Force "evidence/$Run/after" | Out-Null
  $taskCode=$taskCode.Trim().TrimEnd(';').Replace('__TASK_ROOT__',$taskRootJson).Replace('__LOCAL_PASSWORD__',$taskPasswordJson).Replace('__BASE_URL__',$taskBaseJson).Replace('__CAPTURE_DIRECTORY__',$taskCaptureJson)
  Set-Content -LiteralPath '.git/correction-browser-run.js' -Value $taskCode
  & npx --yes --package @playwright/cli playwright-cli "-s=$Session" open $BaseUrl | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Cannot open verification browser'}
  $taskOutput=& npx --yes --package @playwright/cli playwright-cli "-s=$Session" run-code --filename .git/correction-browser-run.js --raw
  $taskExit=$LASTEXITCODE
  $taskOutput | Set-Content -LiteralPath "evidence/$Run/browser-report.json"
  if($taskExit -ne 0){throw 'Browser verification failed; inspect the recorded error'}
  $taskReport=($taskOutput -join "`n") | ConvertFrom-Json
  if($taskReport.errors.Count -ne 0 -or $taskReport.renderP95 -ge 2000){throw 'Browser/performance gate failed'}
  [PSCustomObject]@{checks=$taskReport.checks.Count;captures=$taskReport.screenChecks.Count;renderP95=$taskReport.renderP95;holdIntegrated=$taskReport.holdIntegrated;staging=$taskReport.staging}
} finally { Pop-Location }
