param([ValidateRange(1,7200)][int]$DurationSeconds=3600)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskDir=Join-Path $taskRoot '.sprint1-staging'
$taskConfig=Get-Content -LiteralPath (Join-Path $taskDir 'config.json') -Raw | ConvertFrom-Json
if($taskConfig.profile -ne 'sprint1-laptop-20261015' -or $taskConfig.gatewayPort -ne 3470){throw 'Unexpected staging profile'}
# A bounded thread request, not a persistent power-plan or lid policy change.
# https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Sprint1SessionPower {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern uint SetThreadExecutionState(uint flags);
}
'@
$taskContinuous=[uint32]2147483648
$taskSystemRequired=[uint32]2147483649
$taskLog=Join-Path $taskDir 'awake-session.jsonl'
$taskStarted=[datetime]::UtcNow
$taskHeld=$false
try {
  if([Sprint1SessionPower]::SetThreadExecutionState($taskSystemRequired) -eq 0){throw 'Windows rejected the bounded staging wake request'}
  $taskHeld=$true
  @{time=$taskStarted.ToString('o');event='awake-request-accepted';pid=$PID;durationSeconds=$DurationSeconds;expiresAt=$taskStarted.AddSeconds($DurationSeconds).ToString('o')} | ConvertTo-Json -Compress | Add-Content -LiteralPath $taskLog
  Write-Host "Staging wake request accepted for $DurationSeconds seconds. Keep the laptop lid open, powered and connected; explicit Sleep still suspends staging. This is not a health or deployment PASS."
  $taskClock=[Diagnostics.Stopwatch]::StartNew()
  while($taskClock.Elapsed.TotalSeconds -lt $DurationSeconds){Start-Sleep -Milliseconds 250}
} finally {
  if($taskHeld){
    if([Sprint1SessionPower]::SetThreadExecutionState($taskContinuous) -eq 0){throw 'Windows failed to clear this thread wake request'}
    @{time=[datetime]::UtcNow.ToString('o');event='awake-request-cleared';pid=$PID} | ConvertTo-Json -Compress | Add-Content -LiteralPath $taskLog
    Write-Host 'Staging session ended; this thread wake request was cleared.'
  }
}
