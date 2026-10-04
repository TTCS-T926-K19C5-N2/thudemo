$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot
$taskPriorDatabase=$env:DATABASE_URL
$taskTemp=Join-Path $taskRoot '.git/holds-migration-cycle'
$taskConfig=Join-Path $taskRoot 'apps/api/holds-cycle.config.ts'
if(Test-Path -LiteralPath $taskConfig){throw 'Existing config would be overwritten'}
New-Item -ItemType Directory -Force "$taskTemp/migrations" | Out-Null
Copy-Item -Path "$taskRoot/apps/api/prisma/migrations/*" -Destination "$taskTemp/migrations" -Recurse -Force
New-Item -ItemType Directory -Force "$taskTemp/migrations/202610040006_holds_compensate","$taskTemp/migrations/202610040007_holds_reapply" | Out-Null
Copy-Item -LiteralPath "$taskRoot/apps/api/prisma/verification/holds-compensate.sql" -Destination "$taskTemp/migrations/202610040006_holds_compensate/migration.sql"
Copy-Item -LiteralPath "$taskRoot/apps/api/prisma/migrations/202610040005_seat_holds/migration.sql" -Destination "$taskTemp/migrations/202610040007_holds_reapply/migration.sql"
$taskSchema="$taskRoot/apps/api/prisma/schema.prisma".Replace('\','/')
$taskMigrations="$taskTemp/migrations".Replace('\','/')
@"
import { defineConfig, env } from 'prisma/config';
export default defineConfig({schema:'$taskSchema', migrations:{path:'$taskMigrations'}, datasource:{url:env('DATABASE_URL')}});
"@ | Set-Content -LiteralPath $taskConfig
try {
  $env:DATABASE_URL='postgresql://holds_test:local_fixture_only@127.0.0.1:15434/sang_holds_migration_cycle'
  Push-Location $taskRoot
  & npx --yes pnpm@10.15.1 --filter api exec prisma migrate deploy --config holds-cycle.config.ts 2>&1 | Tee-Object -FilePath evidence/holds/20261004/migration-cycle.log
  if($LASTEXITCODE -ne 0){throw 'Hold migration cycle failed'}
} finally {
  Pop-Location
  $env:DATABASE_URL=$taskPriorDatabase
  Remove-Item -LiteralPath $taskConfig
}
