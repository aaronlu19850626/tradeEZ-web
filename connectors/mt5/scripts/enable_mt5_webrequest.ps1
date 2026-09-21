# Add TradeSync HTTPS URLs to a closed MetaTrader 5 terminal common.ini allowlist.
# A timestamped backup of common.ini is created before any change.
param(
    [string]$TerminalDataRoot = "",
    [string[]]$Url = @("https://192.168.31.116:8443")
)

$ErrorActionPreference = "Stop"

if(Get-Process -Name terminal64 -ErrorAction SilentlyContinue) {
    throw "Close MetaTrader 5 before updating common.ini; otherwise Terminal can overwrite this change."
}

function Find-TerminalDataRoot {
    $terminalRoots = Join-Path $env:APPDATA "MetaQuotes\Terminal"
    if(-not (Test-Path $terminalRoots)) { throw "MetaTrader terminal data folder not found: $terminalRoots" }

    $candidates = Get-ChildItem $terminalRoots -Directory -Force | ForEach-Object {
        $originFile = Join-Path $_.FullName "origin.txt"
        $config = Join-Path $_.FullName "config\common.ini"
        if(Test-Path $config) {
            $origin = if(Test-Path $originFile) { (Get-Content $originFile -Raw).Trim() } else { "" }
            [pscustomobject]@{ Path=$_.FullName; Config=$config; Origin=$origin }
        }
    }

    $candidate = $candidates | Where-Object { $_.Origin -match "MetaTrader 5" } | Select-Object -First 1
    if(-not $candidate) { $candidate = $candidates | Select-Object -First 1 }
    if(-not $candidate) { throw "MetaTrader common.ini was not found." }
    return $candidate.Path
}

if(-not $TerminalDataRoot) { $TerminalDataRoot = Find-TerminalDataRoot }
$configPath = Join-Path $TerminalDataRoot "config\common.ini"
if(-not (Test-Path $configPath)) { throw "common.ini not found: $configPath" }

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$backupPath = "$configPath.tradesync-backup-$timestamp"
Copy-Item -LiteralPath $configPath -Destination $backupPath -Force

$lines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $configPath -Encoding Unicode)
$result = New-Object System.Collections.Generic.List[string]
$inExperts = $false
$settingsInserted = $false
$sawExpertsSection = $false

foreach($line in $lines) {
    if($line -match '^\s*\[(.+?)\]\s*$') {
        if($inExperts -and -not $settingsInserted) {
            $result.Add('WebRequest=1')
            $result.Add("WebRequestUrl=$($Url -join ',')")
            $settingsInserted = $true
        }
        $inExperts = ($Matches[1] -eq 'Experts')
        if($inExperts) { $sawExpertsSection = $true }
        $result.Add($line)
        if($inExperts) {
            $result.Add('WebRequest=1')
            $result.Add("WebRequestUrl=$($Url -join ',')")
            $settingsInserted = $true
        }
        continue
    }

    if($inExperts -and ($line -match '^\s*WebRequest\s*=' -or $line -match '^\s*WebRequestUrl\s*=')) {
        continue
    }
    $result.Add($line)
}

if(-not $sawExpertsSection) {
    if($result.Count -gt 0 -and $result[$result.Count-1] -ne '') { $result.Add('') }
    $result.Add('[Experts]')
    $result.Add('WebRequest=1')
    $result.Add("WebRequestUrl=$($Url -join ',')")
}

Set-Content -LiteralPath $configPath -Value $result -Encoding Unicode
Write-Host "Updated: $configPath"
Write-Host "Backup: $backupPath"
Write-Host "WebRequestUrl=$($Url -join ',')"
