$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$taskResults=@()
Push-Location $taskRoot
try {
  foreach($taskCheck in @('lint','typecheck','test','build')) {
    $taskClock=[Diagnostics.Stopwatch]::StartNew()
    $taskOutput = & npx --yes pnpm@10.15.1 $taskCheck 2>&1
    $taskExit=$LASTEXITCODE
    $taskClock.Stop()
    $taskOutput | Set-Content -LiteralPath "$taskRoot/evidence/sprint2/20261004-local/gate-$taskCheck.log"
    $taskResults += @{ command="pnpm $taskCheck"; exitCode=$taskExit; seconds=$taskClock.Elapsed.TotalSeconds }
    if ($taskExit -ne 0) { throw "$taskCheck failed" }
  }
} finally {
  $taskResults | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$taskRoot/evidence/sprint2/20261004-local/local-gates.json"
  Pop-Location
}
