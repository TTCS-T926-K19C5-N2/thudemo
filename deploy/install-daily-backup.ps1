param(
  [Parameter(Mandatory=$true)][string]$EnvironmentFile,
  [Parameter(Mandatory=$true)][string]$NodePath,
  [string]$At = '02:00'
)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$environment = [IO.Path]::GetFullPath($EnvironmentFile)
if (-not (Test-Path -LiteralPath $environment -PathType Leaf)) { throw 'Provide a protected environment file with DATABASE_URL, BACKUP_TARGET and BACKUP_ENCRYPTION_KEY.' }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node executable not found.' }
$script = Join-Path $project 'apps\api\scripts\sprint-backup.mjs'
$arguments = '--env-file="{0}" "{1}" backup' -f $environment, $script
$action = New-ScheduledTaskAction -Execute $NodePath -Argument $arguments -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
# Deliberately not auto-run: the owner must choose a Windows identity able to
# reach the UNC target and allow this task to run when their session is absent.
Register-ScheduledTask -TaskName 'Codegym-Encrypted-Daily-Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Encrypted PostgreSQL backup to configured off-host target; retains14 days.'
Write-Output 'Task registered. Verify LastTaskResult, UNC permissions and an actual restore drill before marking S55 complete.'
