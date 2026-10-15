param([switch]$TrustCertificate,[switch]$ConfigureFirewall,[switch]$StartWatcher,[string]$MinimumSourceSha)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskDir=Join-Path $taskRoot '.sprint1-staging'
$taskConfig=Get-Content -LiteralPath (Join-Path $taskDir 'config.json') -Raw | ConvertFrom-Json
if($taskConfig.profile -ne 'sprint1-laptop-20261015' -or $taskConfig.gatewayPort -ne 3470){throw 'Unexpected staging profile'}
if($TrustCertificate){
  $taskCertPath=Join-Path $taskDir 'tls/server-cert.cer'
  $taskCertificate=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($taskCertPath)
  if($taskCertificate.Subject -ne 'CN=Sprint1 Laptop Staging'){throw 'Unexpected certificate subject'}
  Import-Certificate -FilePath $taskCertPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
  Write-Host "Trusted only the staging certificate for current user. Thumbprint: $($taskCertificate.Thumbprint)"
}
if($ConfigureFirewall){
  $taskName='Sprint1LaptopStaging-20261015-3470'
  $taskExisting=Get-NetFirewallRule -Name $taskName -ErrorAction SilentlyContinue
  if($taskExisting){
    if($taskExisting.Description -ne $taskDir){throw 'Refuse foreign firewall rule'}
    Write-Host 'Owned staging firewall rule already exists; inspect filters before changing it.'
  }else{
    New-NetFirewallRule -Name $taskName -DisplayName 'Sprint1 laptop staging HTTPS (local subnet only)' -Description $taskDir -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3470 -LocalAddress $taskConfig.lanAddress -RemoteAddress LocalSubnet -Profile Any | Out-Null
    Write-Host 'Firewall permits only staging TCP3470 to the configured LAN address from LocalSubnet.'
  }
}
if($StartWatcher){
  if($MinimumSourceSha -notmatch '^[a-f0-9]{40}$'){throw 'Exact approved minimum SHA required'}
  $taskState=Join-Path $taskDir 'watcher-process.json'
  if(Test-Path -LiteralPath $taskState){
    $taskOld=Get-Content -LiteralPath $taskState -Raw | ConvertFrom-Json
    $taskRunning=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskOld.pid)" -ErrorAction SilentlyContinue
    if($taskRunning -and $taskRunning.CreationDate.ToUniversalTime().ToString('o') -eq $taskOld.created){throw 'Watcher already running; no duplicate started'}
  }
  $taskEntry=Join-Path $PSScriptRoot 'sprint1-staging-watch.mjs'
  $taskChild=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList "`"$taskEntry`" $MinimumSourceSha" -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskDir 'watcher.out.log') -RedirectStandardError (Join-Path $taskDir 'watcher.err.log')
  $taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskChild.Id)"
  @{pid=$taskChild.Id;created=$taskProcess.CreationDate.ToUniversalTime().ToString('o');entry=$taskEntry;minimum=$MinimumSourceSha} | ConvertTo-Json | Set-Content -LiteralPath $taskState
  Write-Host 'Watcher started. It deploys develop only after the approved fix is an ancestor and every CI check succeeds.'
}
