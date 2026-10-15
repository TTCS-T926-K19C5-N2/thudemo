param([ValidateSet('sprint2_cycle','sang_render_migration_cycle')][string]$Database='sprint2_cycle')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot
$taskDbUrl = "postgresql://sprint2:local_fixture_only@127.0.0.1:15432/$Database"
$taskPreviousDatabase = $env:DATABASE_URL
$env:DATABASE_URL = $taskDbUrl
$taskTempName=if($Database -eq 'sprint2_cycle'){'.git/sprint2-migration-cycle'}else{'.git/render-free-migration-cycle'}
$taskTemp = Join-Path $taskRoot $taskTempName
New-Item -ItemType Directory -Force "$taskTemp/migrations" | Out-Null
Copy-Item -Path "$taskRoot/apps/api/prisma/migrations/*" -Destination "$taskTemp/migrations" -Recurse -Force
New-Item -ItemType Directory -Force "$taskTemp/migrations/202610040002_sprint2_compensate","$taskTemp/migrations/202610040003_sprint2_reapply" | Out-Null
Copy-Item -LiteralPath "$taskRoot/apps/api/prisma/verification/sprint2-compensate.sql" -Destination "$taskTemp/migrations/202610040002_sprint2_compensate/migration.sql"
Copy-Item -LiteralPath "$taskRoot/apps/api/prisma/migrations/202610040001_sprint2_seats/migration.sql" -Destination "$taskTemp/migrations/202610040003_sprint2_reapply/migration.sql"
$taskSchema = "$taskRoot/apps/api/prisma/schema.prisma".Replace('\','/')
$taskMigrations = "$taskTemp/migrations".Replace('\','/')
@"
import { defineConfig, env } from 'prisma/config';
export default defineConfig({schema:'$taskSchema', migrations:{path:'$taskMigrations'}, datasource:{url:env('DATABASE_URL')}});
"@ | Set-Content -LiteralPath "$taskRoot/apps/api/sprint2-cycle.config.ts"
try {
  Push-Location $taskRoot
  npx --yes pnpm@10.15.1 --filter api exec prisma migrate deploy --config sprint2-cycle.config.ts
  if ($LASTEXITCODE -ne 0) { throw 'Migration cycle failed' }
} finally {
  Pop-Location
  $env:DATABASE_URL = $taskPreviousDatabase
  # Only this generated config; migrations and history are retained in .git.
  Remove-Item -LiteralPath "$taskRoot/apps/api/sprint2-cycle.config.ts"
}
