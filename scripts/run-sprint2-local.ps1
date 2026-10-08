param([ValidateSet('Api','Web','Worker','Seed','Test','Spike','Migrate')][string]$Mode,[ValidateSet('sprint2_local','stitch_fidelity')][string]$Database='sprint2_local')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$taskPrevious=@{}
foreach($taskKey in @('DATABASE_URL','REDIS_HOST','REDIS_PORT','REDIS_URL','HOLD_EXPIRY_MODE','PORT','HOSTNAME')) { $taskPrevious[$taskKey]=[Environment]::GetEnvironmentVariable($taskKey,'Process') }
try {
  $env:DATABASE_URL="postgresql://sprint2:local_fixture_only@127.0.0.1:15432/$Database"
  $env:REDIS_HOST='127.0.0.1'; $env:REDIS_PORT='16379'
  $env:REDIS_URL='redis://127.0.0.1:16379'; $env:HOLD_EXPIRY_MODE='off'
  Push-Location $taskRoot
  switch($Mode) {
    'Worker' { pnpm --filter api exec node dist/hold-expiry-worker.js }
    'Api' { $env:PORT='3001'; pnpm --filter api run start:prod }
    'Web' {
      $taskStandalone="$taskRoot/apps/web/.next/standalone/apps/web"
      if (!(Test-Path -LiteralPath "$taskStandalone/server.js")) { throw 'Run the production build first' }
      New-Item -ItemType Directory -Force "$taskStandalone/public","$taskStandalone/.next/static" | Out-Null
      Copy-Item -Path "$taskRoot/apps/web/public/*" -Destination "$taskStandalone/public" -Recurse -Force
      New-Item -ItemType Directory -Force "$taskStandalone/.next" | Out-Null
      Copy-Item -Path "$taskRoot/apps/web/.next/static/*" -Destination "$taskStandalone/.next/static" -Recurse -Force
      $env:HOSTNAME='127.0.0.1'; $env:PORT='3000'; node "$taskStandalone/server.js"
    }
    'Seed' { if (!$env:SPRINT2_DEMO_PASSWORD) { throw 'Set SPRINT2_DEMO_PASSWORD to a local fake password with at least 12 characters' }; if($Database -eq 'stitch_fidelity'){ pnpm --filter api exec node scripts/seed-design-fidelity.mjs } else { pnpm --filter api exec node scripts/seed-sprint2.mjs } }
    'Test' {
      $env:DATABASE_URL='postgresql://sprint2:local_fixture_only@127.0.0.1:15432/sprint2_integration'
      pnpm --filter api exec prisma migrate deploy
      if ($LASTEXITCODE -ne 0) { throw 'Test migration failed' }
      pnpm --filter api run test:e2e
    }
    'Spike' { pnpm --filter api exec node scripts/k01-spike.mjs }
    'Migrate' { pnpm --filter api exec prisma migrate deploy }
  }
  if ($LASTEXITCODE -ne 0) { throw "Sprint2 $Mode failed" }
} finally {
  Pop-Location
  foreach($taskKey in $taskPrevious.Keys) { [Environment]::SetEnvironmentVariable($taskKey,$taskPrevious[$taskKey],'Process') }
}
