param([ValidateSet('Hold','Expired')][string]$Phase='Hold', [ValidateSet('holds/20261004','stitch-official/20261004')][string]$Run='holds/20261004')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
Push-Location $taskRoot
try {
  $taskPassword=(Get-Content -LiteralPath '.git/stitch-correction-password' -Raw).Trim()
  $taskFixturePath=if($Run -eq 'holds/20261004'){'.git/hold-browser-fixture.json'}else{".git/hold-browser-fixture-$($Run.Replace('/','-')).json"}
  $taskFixture=Get-Content -LiteralPath $taskFixturePath -Raw
  $taskFile=if($Phase -eq 'Hold'){'scripts/hold-browser-flow.js'}else{'scripts/hold-expired-browser-flow.js'}
  $taskOutputName=if($Phase -eq 'Hold'){'hold-browser-state.json'}else{'expired-browser-state.json'}
  New-Item -ItemType Directory -Force "evidence/$Run/after" | Out-Null
  $taskCode=(Get-Content -LiteralPath $taskFile -Raw).Trim().TrimEnd(';').Replace('__TASK_ROOT__',(ConvertTo-Json -Compress $taskRoot.Replace('\','/'))).Replace('__LOCAL_PASSWORD__',(ConvertTo-Json -Compress $taskPassword)).Replace('__COMPETITOR__',$taskFixture).Replace('__CAPTURE_DIRECTORY__',(ConvertTo-Json -Compress "/evidence/$Run/after/"))
  $taskSession=if($Run -eq 'holds/20261004'){'product-holds'}else{"product-holds-$($Run.Replace('/','-'))"}
  Set-Content -LiteralPath .git/hold-browser-run.js -Value $taskCode
  if($Phase -eq 'Hold'){
    & npx --yes --package @playwright/cli playwright-cli "-s=$taskSession" open http://localhost:3000 | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Browser open failed'}
  }
  $taskResult=& npx --yes --package @playwright/cli playwright-cli "-s=$taskSession" run-code --filename .git/hold-browser-run.js --raw
  $taskExit=$LASTEXITCODE
  $taskResult | Set-Content -LiteralPath "evidence/$Run/$taskOutputName"
  if($taskExit -ne 0){throw 'Hold browser failed; inspect recorded error'}
  $taskParsed=($taskResult -join "`n") | ConvertFrom-Json
  if($taskParsed.errors.Count -gt 0){throw 'Browser runtime error'}
  [PSCustomObject]@{phase=$Phase;checks=$taskParsed.checks.Count;screens=$taskParsed.screens.Count;jsErrors=$taskParsed.errors.Count}
} finally {Pop-Location}
