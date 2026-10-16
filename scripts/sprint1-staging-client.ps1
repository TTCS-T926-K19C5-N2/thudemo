param([string]$OutputPath=(Join-Path ([Environment]::GetFolderPath('Desktop')) 'sprint1-wifi-client-evidence.json'))
$ErrorActionPreference='Stop'
$taskOrigin='https://10.88.164.155:3470'
$taskRunId=[guid]::NewGuid().ToString('N')
$taskRows=New-Object System.Collections.Generic.List[object]
$taskReport=@{runId=$taskRunId;startedUtc=[DateTime]::UtcNow.ToString('o');origin=$taskOrigin;clientOS='Windows';clientIPv4=@();results=$taskRows;tls='Windows certificate and hostname verification enabled; no bypass';scope='Real second Wi-Fi peer, rotating nonexistent fixture accounts and spoofed caller IP headers; no credentials requested or stored';restoration='Only this client IP may be limited for at most 900 seconds. Wait naturally; never shorten TTL or delete locks.'}
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
function Save-TaskReport {
  $taskReport.completedUtc=[DateTime]::UtcNow.ToString('o')
  $taskReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
try {
  $taskReport.clientIPv4=@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notmatch '^127\.|^169\.254\.'} | Select-Object -ExpandProperty IPAddress)
  if($taskReport.clientIPv4 -contains '10.88.164.155'){throw 'Run this probe on the SECOND Windows machine, not the staging laptop.'}
  $taskHome=Invoke-WebRequest -Uri $taskOrigin -UseBasicParsing -TimeoutSec 15
  if($taskHome.StatusCode -ne 200){throw 'Home did not return 200'}
  $taskHealth=Invoke-WebRequest -Uri ($taskOrigin+'/api/health') -UseBasicParsing -TimeoutSec 15
  if($taskHealth.StatusCode -ne 200){throw 'Dependency health did not return 200'}
  $taskRows.Add(@{name='second-device-trusted-https-home-health';status='PASS';home=200;health=200})
  Write-Host 'This bounded probe may lock only this client IP for 15 minutes. It uses no real account/password.'
  $taskBudgetReached=$false
  $taskFailures=0
  for($taskIndex=0;$taskIndex -lt 31;$taskIndex++) {
    $taskBody=@{email="wifi-probe-$taskRunId-$taskIndex@sprint1.staging.invalid";password='incorrect-synthetic-probe-only'} | ConvertTo-Json -Compress
    $taskStatus=0
    try {
      $taskResponse=Invoke-WebRequest -Uri ($taskOrigin+$(if($taskIndex%2){'/api/Auth/LOGIN'}else{'/api/auth/login'})) -Method Post -UseBasicParsing -TimeoutSec 15 -ContentType 'application/json' -Headers @{Origin=$taskOrigin;'X-Forwarded-For'="198.51.100.$($taskIndex+1)";'x-event-login-peer'='caller-forged-not-a-server-signature'} -Body $taskBody
      $taskStatus=[int]$taskResponse.StatusCode
    } catch {
      if($null -eq $_.Exception.Response){throw}
      $taskStatus=[int]$_.Exception.Response.StatusCode
    }
    if($taskStatus -eq 401){$taskFailures++;continue}
    if($taskStatus -eq 429){$taskBudgetReached=$true;break}
    throw "Unexpected login status $taskStatus; stop without weakening assertions."
  }
  if(-not $taskBudgetReached){throw 'Expected shared IP budget 429 after at most 30 failed attempts'}
  $taskRows.Add(@{name='rotated-accounts-case-alias-spoofed-ip-shared-budget';status='PASS';wrongAttemptsThisRun=$taskFailures;nextStatus=429;limitSeconds=900;note='Server Redis proof and simultaneous unblocked laptop login must be checked separately; existing IP failures can reduce the number executed in this run.'})
  $taskReport.result='PASS for these cases; laptop peer independence still requires server verification'
  Save-TaskReport
  Write-Host "Evidence saved: $OutputPath"
} catch {
  $taskReport.result='FAIL or BLOCKED; inspect this machine TLS/network and reported step'
  $taskRows.Add(@{name='probe-stopped';status='FAIL';errorType=$_.Exception.GetType().Name})
  Save-TaskReport
  Write-Host "Probe stopped. Sanitized evidence saved: $OutputPath"
  throw 'Second-device probe failed; no TLS bypass or automatic retry was applied.'
}
