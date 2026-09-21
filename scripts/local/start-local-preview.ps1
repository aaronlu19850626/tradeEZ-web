# Starts the local web preview and LAN-accessible EA API on port 8000.
# LAN/HTTPS uses backend/scripts/start-https-lan.ps1.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendPath = Join-Path $projectRoot 'backend'
$frontendPath = Join-Path $projectRoot 'frontend'
$pythonPath = Join-Path $backendPath 'venv\Scripts\python.exe'
$nextPath = Join-Path $frontendPath 'node_modules\next\dist\bin\next'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path -LiteralPath $pythonPath) -or !(Test-Path -LiteralPath $nextPath)) {
    throw 'Install backend/venv and frontend/node_modules before starting the preview.'
}

function Test-LocalPort([int] $Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}

function Wait-Ready([string] $Url, [System.Diagnostics.Process] $Process) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($Process.HasExited) { throw "Preview process exited. Check preview.err.log in its directory." }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "Preview did not become ready at $Url. Check preview.err.log."
}

# Never stop another process or silently reuse a frontend with different EA settings.
if (Test-LocalPort 3000) { throw 'Port 3000 is occupied. Stop the existing preview before running this script.' }
if (Test-LocalPort 8000) {
    $health = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 3
    if ($health.status -ne 'ok') { throw 'Port 8000 does not have a healthy TradeSync service.' }
} else {
    $backendProcess = Start-Process -FilePath $pythonPath -WorkingDirectory $backendPath `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $backendPath 'preview.out.log') `
        -RedirectStandardError (Join-Path $backendPath 'preview.err.log')
    Wait-Ready 'http://127.0.0.1:8000/health' $backendProcess
}

$previousApi = $env:NEXT_PUBLIC_API_BASE_URL
$previousEaApi = $env:NEXT_PUBLIC_EA_API_BASE_URL
try {
    $env:NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8000/api/v1'
    $env:NEXT_PUBLIC_EA_API_BASE_URL = 'http://127.0.0.1:8000/api/v1'
    $frontendProcess = Start-Process -FilePath $nodePath -WorkingDirectory $frontendPath `
        -ArgumentList @(('"' + $nextPath + '"'), 'dev', '--hostname', '127.0.0.1', '--port', '3000') `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $frontendPath 'preview.out.log') `
        -RedirectStandardError (Join-Path $frontendPath 'preview.err.log')
} finally {
    $env:NEXT_PUBLIC_API_BASE_URL = $previousApi
    $env:NEXT_PUBLIC_EA_API_BASE_URL = $previousEaApi
}
Wait-Ready 'http://127.0.0.1:3000/auth/v2/login' $frontendProcess
Write-Host 'Web: http://127.0.0.1:3000/dashboard/accounts'
Write-Host 'EA Inp_ApiBaseURL / WebRequest: http://127.0.0.1:8000'
Write-Host ('Frontend process: ' + $frontendProcess.Id)
& (Join-Path $backendPath 'scripts\start-lan-api.ps1')
& (Join-Path $projectRoot 'scripts\lan\start-lan-preview.ps1')
