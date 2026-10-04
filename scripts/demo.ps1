param(
  [ValidateSet('Start','Stop','Status')][string]$Action = 'Start',
  [switch]$Build,
  [switch]$Install,
  [switch]$Seed,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot
$taskRunner = Join-Path $PSScriptRoot 'run-sprint2-local.ps1'
$taskPrivate = Join-Path $taskRoot '.git/demo-local'
$taskStatePath = Join-Path $taskPrivate 'processes.json'
$taskState = @()
if (Test-Path -LiteralPath $taskStatePath) {
  $taskRecord = Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json
  if ($taskRecord.root -ne $taskRoot) { throw 'State file belongs to another checkout.' }
  $taskState = @($taskRecord.processes)
}
function Save-DemoState {
  New-Item -ItemType Directory -Force -Path $taskPrivate | Out-Null
  @{root=$taskRoot; processes=@($script:taskState)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskStatePath -Encoding UTF8
}
function Get-OwnedLauncher($entry) {
  $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.pid)" -ErrorAction SilentlyContinue
  if ($taskProcess -and $taskProcess.CreationDate.ToUniversalTime().ToString('o') -eq $entry.created -and $taskProcess.CommandLine.Contains($taskRunner)) { return $taskProcess }
  return $null
}
function Stop-OwnedTree($entry) {
  $taskParent = Get-OwnedLauncher $entry
  if (!$taskParent) { return }
  # Traverse only descendants of the verified launcher; never stop all Node processes.
  function Stop-DemoChild($taskPid) {
    $taskChildren = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$taskPid")
    foreach ($taskChild in $taskChildren) {
      $taskCurrent = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskChild.ProcessId)" -ErrorAction SilentlyContinue
      if ($taskCurrent -and $taskCurrent.CreationDate -eq $taskChild.CreationDate) { Stop-DemoChild $taskChild.ProcessId }
    }
    Stop-Process -Id $taskPid -ErrorAction SilentlyContinue
  }
  Stop-DemoChild $taskParent.ProcessId
}
function Get-DemoListener($port) {
  return @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count -gt 0
}
function Wait-DemoHttp($url, $seconds = 60) {
  $taskDeadline = [DateTime]::UtcNow.AddSeconds($seconds)
  do {
    try { return Invoke-RestMethod -Uri $url -TimeoutSec 3 } catch { Start-Sleep -Milliseconds 500 }
  } while ([DateTime]::UtcNow -lt $taskDeadline)
  throw "Service not ready: $url. Inspect private logs in $taskPrivate."
}
function Start-DemoProcess($mode) {
  $taskOwned = @($script:taskState | Where-Object { $_.mode -eq $mode -and (Get-OwnedLauncher $_) })
  if ($taskOwned.Count) { Write-Host "$mode already running (script-owned)."; return }
  $taskLogDirectory = Join-Path $taskPrivate ([DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff'))
  New-Item -ItemType Directory -Force -Path $taskLogDirectory | Out-Null
  $taskShell = Join-Path $PSHOME 'powershell.exe'
  if (!(Test-Path -LiteralPath $taskShell)) { $taskShell = (Get-Command powershell.exe).Source }
  $taskProcess = Start-Process -FilePath $taskShell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$taskRunner`" -Mode $mode -Database stitch_fidelity" -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogDirectory "$mode.out.log") -RedirectStandardError (Join-Path $taskLogDirectory "$mode.err.log")
  $taskInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskProcess.Id)"
  if (!$taskInfo) { throw "$mode launcher exited immediately. Check $taskLogDirectory." }
  $script:taskState += @{mode=$mode; pid=$taskProcess.Id; created=$taskInfo.CreationDate.ToUniversalTime().ToString('o'); logs=$taskLogDirectory}
  Save-DemoState
  Write-Host "$mode started; logs: $taskLogDirectory"
}
if ($Action -eq 'Stop') {
  foreach ($taskEntry in $taskState) { Stop-OwnedTree $taskEntry }
  $script:taskState = @(); Save-DemoState
  Write-Host 'Stopped only processes launched by demo.ps1. Containers/data and pre-existing servers retained.'
  exit 0
}
if ($Action -eq 'Status') {
  foreach ($taskPort in @(3000,3001)) { Write-Host "$taskPort listening: $(Get-DemoListener $taskPort)" }
  foreach ($taskEntry in $taskState) { Write-Host "$($taskEntry.mode) owned/running: $([bool](Get-OwnedLauncher $taskEntry))" }
  exit 0
}
$taskNewModes = @()
Push-Location $taskRoot
try {
  $taskNodeVersion = & node --version
  if ($LASTEXITCODE -ne 0 -or $taskNodeVersion -notmatch '^v24\.') { throw 'Install Node 24.x as approved, then retry.' }
  $taskNpx = (Get-Command npx.cmd -ErrorAction Stop).Source
  $taskDockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
  $taskDocker = if ($taskDockerCommand) { $taskDockerCommand.Source } else { 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' }
  if (!(Test-Path -LiteralPath $taskDocker)) { throw 'Docker Desktop executable not found. Install/start Docker Desktop with Linux engine.' }
  $taskEngine = & $taskDocker info --format '{{.OSType}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or "$taskEngine".Trim() -ne 'linux') { throw 'Open Docker Desktop and wait for Linux Engine running, then retry.' }
  foreach ($taskService in @(
    @{name='sang-sprint2-postgres-20261004'; port=15432; internal=5432; image='postgres:15-alpine'},
    @{name='sang-sprint2-redis-20261004'; port=16379; internal=6379; image='redis:7-alpine'}
  )) {
    $taskExistingNames = @(& $taskDocker container ls -a --format '{{.Names}}')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list local containers.' }
    if ($taskExistingNames -contains $taskService.name) {
      $taskContainer = (& $taskDocker inspect $taskService.name | ConvertFrom-Json)[0]
      $taskBinding = @($taskContainer.HostConfig.PortBindings.PSObject.Properties | Where-Object Name -eq "$($taskService.internal)/tcp")[0].Value
      if ($taskContainer.Config.Image -ne $taskService.image -or !(@($taskBinding | Where-Object { $_.HostIp -eq '127.0.0.1' -and $_.HostPort -eq "$($taskService.port)" }).Count)) { throw "Unexpected configuration for $($taskService.name); inspect manually. No container changed." }
      & $taskDocker start $taskService.name | Out-Null
    } else {
      if (Get-DemoListener $taskService.port) { throw "Port $($taskService.port) occupied; no container created." }
      if ($taskService.internal -eq 5432) {
        & $taskDocker run -d --name $taskService.name -p '127.0.0.1:15432:5432' -e POSTGRES_USER=sprint2 -e POSTGRES_PASSWORD=local_fixture_only -e POSTGRES_DB=stitch_fidelity --mount 'type=volume,source=sang-sprint2-postgres-data,target=/var/lib/postgresql/data' $taskService.image | Out-Null
      } else {
        & $taskDocker run -d --name $taskService.name -p '127.0.0.1:16379:6379' $taskService.image | Out-Null
      }
    }
    if ($LASTEXITCODE -ne 0) { throw "Failed to start $($taskService.name)." }
  }
  $taskDeadline = [DateTime]::UtcNow.AddSeconds(60)
  do {
    & $taskDocker exec sang-sprint2-postgres-20261004 pg_isready -U sprint2 -d stitch_fidelity *> $null
    $taskPostgresReady = $LASTEXITCODE -eq 0
    $taskRedisResult = & $taskDocker exec sang-sprint2-redis-20261004 redis-cli ping 2>$null
    $taskRedisReady = $LASTEXITCODE -eq 0 -and "$taskRedisResult".Trim() -eq 'PONG'
    if ($taskPostgresReady -and $taskRedisReady) { break }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $taskDeadline)
  if (!$taskPostgresReady -or !$taskRedisReady) { throw 'PostgreSQL/Redis not ready after 60 seconds; inspect containers, do not reset data.' }
  $taskNeedBuild = $Build -or !(Test-Path -LiteralPath 'apps/api/dist/main.js') -or !(Test-Path -LiteralPath 'apps/api/dist/hold-expiry-worker.js') -or !(Test-Path -LiteralPath 'apps/web/.next/standalone/apps/web/server.js')
  $taskNeedInstall = $Install -or !(Test-Path -LiteralPath 'node_modules')
  if (($taskNeedBuild -or $taskNeedInstall -or $Seed) -and ((Get-DemoListener 3000) -or (Get-DemoListener 3001) -or @($taskState | Where-Object { Get-OwnedLauncher $_ }).Count)) { throw 'Build/install/seed requires apps stopped. Run -Action Stop for script-owned apps; stop pre-existing terminals with Ctrl+C.' }
  if ($taskNeedInstall) { & $taskNpx --yes pnpm@10.15.1 install --frozen-lockfile; if ($LASTEXITCODE -ne 0) { throw 'Frozen-lockfile installation failed.' } }
  # Invoke in a child shell: the existing runner has its own environment restoration.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $taskRunner -Mode Migrate -Database stitch_fidelity
  if ($LASTEXITCODE -ne 0) { throw 'Migration deploy failed; no reset/db push attempted.' }
  if ($taskNeedBuild) {
    $taskPreviousDatabase = $env:DATABASE_URL
    try {
      $env:DATABASE_URL='postgresql://sprint2:local_fixture_only@127.0.0.1:15432/stitch_fidelity'
      & $taskNpx --yes pnpm@10.15.1 --filter api exec prisma generate
      if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed.' }
      & $taskNpx --yes pnpm@10.15.1 build
      if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    } finally { $env:DATABASE_URL = $taskPreviousDatabase }
  }
  if ($Seed) {
    $taskPasswordPath=Join-Path $taskRoot '.git/stitch-correction-password'
    if (!(Test-Path -LiteralPath $taskPasswordPath)) { [IO.File]::WriteAllText($taskPasswordPath, ([Guid]::NewGuid().ToString('N')+'aA!7')) }
    $taskPreviousPassword=$env:SPRINT2_DEMO_PASSWORD
    try {
      $env:SPRINT2_DEMO_PASSWORD=(Get-Content -LiteralPath $taskPasswordPath -Raw).Trim()
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $taskRunner -Mode Seed -Database stitch_fidelity
      if ($LASTEXITCODE -ne 0) { throw 'Local fixture seed failed.' }
    } finally { $env:SPRINT2_DEMO_PASSWORD=$taskPreviousPassword }
  }
  if (!(Get-DemoListener 3001)) { Start-DemoProcess 'Api'; $taskNewModes += 'Api' }
  $taskHealth = Wait-DemoHttp 'http://localhost:3001/health'
  if ($taskHealth.status -ne 'ok') { throw 'API health not ok.' }
  # Probe the configured synthetic dataset rather than accepting an arbitrary API on this port.
  $taskShow = Wait-DemoHttp 'http://localhost:3001/showtimes/c0100401-0000-4000-8000-000000000001'
  if ($taskShow.id -ne 'c0100401-0000-4000-8000-000000000001') { throw 'Review fixture missing. Use -Seed once on an empty local database; never reseed edited data automatically.' }
  if (!(Get-DemoListener 3000)) { Start-DemoProcess 'Web'; $taskNewModes += 'Web' }
  $null = Wait-DemoHttp 'http://localhost:3000'
  if (!@($taskState | Where-Object { $_.mode -eq 'Worker' -and (Get-OwnedLauncher $_) }).Count) {
    if (@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'hold-expiry-worker\.js' }).Count) { throw 'An unmanaged expiry worker is already running. Stop/identify it before starting a second worker.' }
    Start-DemoProcess 'Worker'; $taskNewModes += 'Worker'
  }
  $taskWorker = @($taskState | Where-Object { $_.mode -eq 'Worker' -and (Get-OwnedLauncher $_) })[0]
  $taskDeadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    if (!(Get-OwnedLauncher $taskWorker)) { throw 'Expiry worker exited. Inspect private logs.' }
    $taskLog = Join-Path $taskWorker.logs 'Worker.out.log'
    if ((Test-Path -LiteralPath $taskLog) -and (Select-String -LiteralPath $taskLog -Pattern 'HoldExpiryWorkerModule dependencies initialized' -Quiet)) { break }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $taskDeadline)
  if (!(Select-String -LiteralPath $taskLog -Pattern 'HoldExpiryWorkerModule dependencies initialized' -Quiet)) { throw 'Worker startup not confirmed within 30 seconds.' }
  Write-Host "Demo ready: http://localhost:3000 | API: http://localhost:3001/health"
  Write-Host 'Buyer: design-buyer@example.invalid | Organizer: design-organizer@example.invalid'
  Write-Host 'Password: open .git/stitch-correction-password locally. No password printed.'
  Write-Host 'Expiry worker started locally. This does not certify staging uptime or T-31 performance.'
  if (!$NoBrowser) { Start-Process 'http://localhost:3000' }
} catch {
  foreach ($taskEntry in @($taskState | Where-Object { $taskNewModes -contains $_.mode })) { Stop-OwnedTree $taskEntry }
  $script:taskState=@($taskState | Where-Object { Get-OwnedLauncher $_ }); Save-DemoState
  throw
} finally { Pop-Location }
