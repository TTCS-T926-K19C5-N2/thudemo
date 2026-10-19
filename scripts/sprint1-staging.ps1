param([ValidateSet('Init','Deploy','Status','Rollback','Stop')][string]$Action='Status',[string]$LanAddress,[string]$SourceSha)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if ((& node --version) -ne 'v24.21.0') {throw 'Node24.21.0 required'}
$taskArgs=@('scripts/sprint1-staging.mjs',$Action.ToLowerInvariant())
if($LanAddress){$taskArgs+=@('--lan',$LanAddress)}
if($SourceSha){$taskArgs+=@('--sha',$SourceSha)}
& node @taskArgs
if($LASTEXITCODE -ne 0){throw 'Staging command failed; inspect .sprint1-staging/logs. No READY claimed.'}
