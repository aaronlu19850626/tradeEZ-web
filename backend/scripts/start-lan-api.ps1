# Keep the local API running; expose a second worker only on the requested WLAN address.
$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$lanAddress = '192.168.31.116'
if (!(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $lanAddress -ErrorAction SilentlyContinue)) {
    throw "The configured LAN address $lanAddress is not assigned to this computer."
}
$existing = Get-NetTCPConnection -LocalAddress $lanAddress -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (!$existing) {
    Start-Process -FilePath (Join-Path $backendRoot 'venv\Scripts\python.exe') -WorkingDirectory $backendRoot `
        -ArgumentList @('-m','uvicorn','app.main:app','--host',$lanAddress,'--port','8000') `
        -WindowStyle Hidden -RedirectStandardOutput (Join-Path $backendRoot 'lan-api.out.log') `
        -RedirectStandardError (Join-Path $backendRoot 'lan-api.err.log') | Out-Null
}
Write-Host "LAN EA API: http://${lanAddress}:8000"
