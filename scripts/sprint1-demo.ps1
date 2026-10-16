param([switch]$SkipBuild,[ValidateSet('Start','Status','Stop','Restart')][string]$Action='Start',[switch]$Legacy)
$ErrorActionPreference='Stop'
if (!$Legacy) {
  $taskArguments = @((Join-Path $PSScriptRoot 'sprint1-onboarding.mjs'), $Action)
  if ($SkipBuild) { $taskArguments += '--skip-build' }
  & node @taskArguments
  exit $LASTEXITCODE
}
$taskRoot=Split-Path -Parent $PSScriptRoot
Set-Location $taskRoot
function Check-Exit([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit $LASTEXITCODE). See .sprint1-local logs." } }
function Invoke-NativeLog([string]$Exe,[string[]]$NativeArguments,[string]$Log) {
  # Windows PowerShell 5 treats native stderr as ErrorRecords even on exit 0.
  # Capture both streams and judge the actual process exit code.
  $taskPreviousPreference=$ErrorActionPreference
  try {
    $ErrorActionPreference='Continue'
    & $Exe @NativeArguments 2>&1 | Out-File -LiteralPath $Log -Encoding utf8
    $taskExit=$LASTEXITCODE
  } finally { $ErrorActionPreference=$taskPreviousPreference }
  if ($taskExit -ne 0) { throw "$Exe failed (exit $taskExit); see $Log" }
}
if ((& node --version) -ne 'v24.21.0') { throw 'Node 24.21.0 required' }
if ((& corepack pnpm --version) -ne '10.15.1') { throw 'Run from this worktree with pnpm 10.15.1' }
& docker info --format '{{.OSType}}'; Check-Exit 'Docker Linux engine'
& node scripts/sprint1-setup.mjs; Check-Exit 'Local config'
$taskDir=Join-Path $taskRoot '.sprint1-local'
$taskConfig=Get-Content -LiteralPath (Join-Path $taskDir 'config.json') -Raw | ConvertFrom-Json
# Override inherited service targets before Prisma/seed. This process belongs
# only to this demo; do not let a caller's production DATABASE_URL take priority.
$env:DATABASE_URL="postgresql://$($taskConfig.user):$($taskConfig.dbPassword)@127.0.0.1:$($taskConfig.pgPort)/sprint1_gitflow_20261015?schema=public"
$env:REDIS_HOST='127.0.0.1'
$env:REDIS_PORT="$($taskConfig.redisPort)"
Remove-Item Env:REDIS_URL -ErrorAction SilentlyContinue
if ($Action -eq 'Stop') {
  $taskRunner=Join-Path $PSScriptRoot 'sprint1-process.ps1'
  function Stop-OwnedChild([int]$TaskProcessId) {
    foreach ($taskChild in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$TaskProcessId")) { Stop-OwnedChild $taskChild.ProcessId }
    Stop-Process -Id $TaskProcessId -ErrorAction SilentlyContinue
  }
  $taskProcessState=Get-Content -LiteralPath (Join-Path $taskDir 'processes.json') -Raw | ConvertFrom-Json
  foreach ($taskEntry in $taskProcessState) {
    $taskLauncher=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskEntry.pid)" -ErrorAction SilentlyContinue
    if ($taskLauncher -and $taskLauncher.Name -eq 'powershell.exe' -and $taskLauncher.CommandLine.Contains($taskRunner) -and (!$taskEntry.created -or $taskLauncher.CreationDate.ToUniversalTime().ToString('o') -eq $taskEntry.created)) { Stop-OwnedChild $taskLauncher.ProcessId }
  }
  Write-Host 'Stopped only verified Sprint1 launcher trees. Containers, volumes and data retained.'
  exit 0
}
function Confirm-Ready {
  $taskHealth=Invoke-RestMethod "http://127.0.0.1:$($taskConfig.apiPort)/health" -TimeoutSec 3
  $taskWeb=Invoke-WebRequest "http://127.0.0.1:$($taskConfig.webPort)/" -UseBasicParsing -TimeoutSec 3
  $taskProxy=Invoke-WebRequest "http://127.0.0.1:$($taskConfig.webPort)/api/health" -UseBasicParsing -TimeoutSec 3
  return ($taskHealth.status -eq 'ok' -and $taskWeb.StatusCode -eq 200 -and $taskProxy.StatusCode -eq 200)
}
function Write-Ready {
  Write-Host "READY web=http://localhost:$($taskConfig.webPort) API=http://localhost:$($taskConfig.apiPort) source=$(& git rev-parse HEAD) + local diff"
  Write-Host 'Credentials: .sprint1-local/config.json (private, Git ignored)'
}
if ($Action -eq 'Status') {
  if (!(Confirm-Ready)) { throw 'Health/web/proxy not ready' }
  Write-Ready
  exit 0
}
foreach ($taskService in @(@{name='sprint1-gitflow-pg-20261015';port=$taskConfig.pgPort},@{name='sprint1-gitflow-redis-20261015';port=$taskConfig.redisPort})) {
  $taskNames=@(& docker ps -a --format '{{.Names}}'); Check-Exit 'Container inventory'
  if ($taskNames -contains $taskService.name) {
    $taskInspect=(& docker inspect $taskService.name | ConvertFrom-Json)[0]
    if ($taskInspect.Config.Labels.'sprint1.review' -ne '20261015') { throw 'Refuse foreign container' }
  } elseif (Get-NetTCPConnection -State Listen -LocalPort $taskService.port -ErrorAction SilentlyContinue) { throw "Port $($taskService.port) busy; no process stopped" }
}
foreach ($taskPort in @($taskConfig.apiPort,$taskConfig.webPort)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue) { throw "Port $taskPort already listening. Use runbook health/status; no process stopped." }
}
& docker compose -p sprint1-gitflow-20261015 -f .sprint1-local/compose.json up -d --wait; Check-Exit 'Dependencies'
Invoke-NativeLog 'corepack.cmd' @('pnpm','install','--frozen-lockfile') '.sprint1-local/install.log'
Push-Location apps/api
try {
  Invoke-NativeLog 'corepack.cmd' @('pnpm','exec','prisma','migrate','deploy') '../../.sprint1-local/migrate.log'
  Invoke-NativeLog 'corepack.cmd' @('pnpm','exec','prisma','generate') '../../.sprint1-local/generate.log'
} finally { Pop-Location }
& node apps/api/scripts/seed-sprint1.mjs; Check-Exit 'Guarded seed'
if (!$SkipBuild) { Invoke-NativeLog 'corepack.cmd' @('pnpm','build') '.sprint1-local/build.log' }
$taskRunner=Join-Path $PSScriptRoot 'sprint1-process.ps1'
$taskOwned=@()
foreach ($taskMode in @('api','web')) {
  $taskProcess=Start-Process -FilePath powershell.exe -ArgumentList "-NoProfile -File `"$taskRunner`" -Mode $taskMode" -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskDir "$taskMode.out.log") -RedirectStandardError (Join-Path $taskDir "$taskMode.err.log")
  $taskInfo=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskProcess.Id)"
  $taskOwned+=@{mode=$taskMode;pid=$taskProcess.Id;runner=$taskRunner;created=$taskInfo.CreationDate.ToUniversalTime().ToString('o')}
}
$taskOwned | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDir 'processes.json')
$taskReady=$false
for ($taskAttempt=0;$taskAttempt -lt 90;$taskAttempt++) {
  try {
    if (Confirm-Ready) { $taskReady=$true;break }
  } catch { Start-Sleep -Milliseconds 500 }
}
if (!$taskReady) { throw 'Health/web/proxy failed. Inspect .sprint1-local/*.log; READY not reached.' }
Write-Ready
