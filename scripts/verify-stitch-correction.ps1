param([switch]$SkipBuild, [ValidateSet('stitch-correction/20261004','render-free/20261004','holds/20261004','stitch-official/20261004')][string]$Run='stitch-correction/20261004')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$taskResults=@()
Push-Location $taskRoot
try {
  $taskChecks=@('lint','typecheck','test')
  if(!$SkipBuild){$taskChecks+='build'}
  foreach($taskCheck in $taskChecks){
    $taskClock=[Diagnostics.Stopwatch]::StartNew()
    $taskOutput=& npx --yes pnpm@10.15.1 $taskCheck 2>&1
    $taskExit=$LASTEXITCODE
    $taskClock.Stop()
    $taskOutput | Set-Content -LiteralPath "evidence/$Run/gate-$taskCheck.log"
    $taskResults+=@{command="pnpm $taskCheck";exitCode=$taskExit;seconds=$taskClock.Elapsed.TotalSeconds}
    if($taskExit -ne 0){throw "$taskCheck failed"}
  }
} finally {
  $taskResults | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "evidence/$Run/local-gates.json"
  Pop-Location
}

