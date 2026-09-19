$ErrorActionPreference = 'Stop'
$address = '192.168.31.116'
if (!(Get-NetIPAddress -IPAddress $address -ErrorAction SilentlyContinue)) { throw 'Configured WLAN IP is not assigned.' }
if (!(Get-NetTCPConnection -LocalAddress $address -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"' + (Join-Path $PSScriptRoot 'scripts\lan-preview.cjs') + '"')) `
        -WorkingDirectory $PSScriptRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $PSScriptRoot 'lan-web.out.log') `
        -RedirectStandardError (Join-Path $PSScriptRoot 'lan-web.err.log') | Out-Null
}
& (Join-Path $PSScriptRoot 'backend\scripts\start-lan-api.ps1')
Write-Host 'LAN Web: http://192.168.31.116:3000'
