$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$taskOldDb=$env:DATABASE_URL; $taskOldRedis=$env:REDIS_PORT; $taskOldDocker=$env:K01_DOCKER_EXE
try {
  $env:DATABASE_URL='postgresql://k01:local_fixture_only@127.0.0.1:15433/k01_render_local'
  $env:REDIS_PORT='16380'; $env:K01_DOCKER_EXE='C:/Program Files/Docker/Docker/resources/bin/docker.exe'
  Push-Location $taskRoot
  npx --yes pnpm@10.15.1 --filter api exec node scripts/k01/compare-candidates.mjs
  if($LASTEXITCODE -ne 0){throw 'K-01 candidate verification failed'}
} finally {
  Pop-Location
  $env:DATABASE_URL=$taskOldDb; $env:REDIS_PORT=$taskOldRedis; $env:K01_DOCKER_EXE=$taskOldDocker
}
