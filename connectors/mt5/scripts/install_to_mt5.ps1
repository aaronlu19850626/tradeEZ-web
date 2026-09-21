# Install TradeSync probe EA into the active MetaTrader 5 terminal data folder.
# The probe is installed separately and does not overwrite the existing tradeEZ strategy.
param(
    [string]$TerminalDataRoot = "",
    [string]$MetaEditorPath = "C:\Program Files\MetaTrader 5\MetaEditor64.exe",
    [string]$InstallFolderName = "TradeEZ",
    [switch]$SkipCompile
)

$ErrorActionPreference = "Stop"
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$connectorRoot = Split-Path -Parent $sourceDir
$probeDir = Join-Path $connectorRoot "probe"
$mq5Source = Join-Path $probeDir "TradeSyncProbeEA.mq5"
$ex5Source = Join-Path $probeDir "TradeSyncProbeEA.ex5"

if(-not (Test-Path $mq5Source)) { throw "Source EA not found: $mq5Source" }

if(-not $TerminalDataRoot) {
    $terminalRoots = Join-Path $env:APPDATA "MetaQuotes\Terminal"
    if(-not (Test-Path $terminalRoots)) { throw "MetaTrader terminal data folder not found: $terminalRoots" }

    $candidates = Get-ChildItem $terminalRoots -Directory -Force | ForEach-Object {
        $originFile = Join-Path $_.FullName "origin.txt"
        $expertsDir = Join-Path $_.FullName "MQL5\Experts"
        if(Test-Path $expertsDir) {
            $origin = if(Test-Path $originFile) { (Get-Content $originFile -Raw).Trim() } else { "" }
            [pscustomobject]@{ Path=$_.FullName; Experts=$expertsDir; Origin=$origin }
        }
    }

    $candidate = $candidates |
        Where-Object { $_.Origin -match "MetaTrader 5" } |
        Select-Object -First 1
    if(-not $candidate) { $candidate = $candidates | Select-Object -First 1 }
    if(-not $candidate) { throw "No MetaTrader terminal with MQL5\Experts was found." }
    $TerminalDataRoot = $candidate.Path
}

$expertsRoot = Join-Path $TerminalDataRoot "MQL5\Experts"
if(-not (Test-Path $expertsRoot)) { throw "Experts folder not found: $expertsRoot" }

$targetDir = Join-Path $expertsRoot $InstallFolderName
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$mq5Target = Join-Path $targetDir "TradeSyncProbeEA.mq5"
$ex5Target = Join-Path $targetDir "TradeSyncProbeEA.ex5"
Copy-Item -LiteralPath $mq5Source -Destination $mq5Target -Force
if(Test-Path $ex5Source) { Copy-Item -LiteralPath $ex5Source -Destination $ex5Target -Force }

Write-Host "Installed source: $mq5Target"
if(Test-Path $ex5Target) { Write-Host "Installed binary: $ex5Target" }

if(-not $SkipCompile) {
    if(-not (Test-Path $MetaEditorPath)) { throw "MetaEditor not found: $MetaEditorPath" }
    $logPath = Join-Path $targetDir "TradeSyncProbeEA.compile.log"
    Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $MetaEditorPath `
        -ArgumentList @("/compile:$mq5Target", "/log:$logPath") `
        -Wait -PassThru -WindowStyle Hidden
    Write-Host "MetaEditor exit code: $($process.ExitCode)"
    if(Test-Path $logPath) {
        $log = Get-Content -LiteralPath $logPath -Raw -Encoding Unicode
        Write-Host $log
        if($log -match "Result:\s*([1-9]\d*)\s+errors") { throw "MetaEditor reported compile errors." }
    } else {
        Write-Warning "MetaEditor did not create a compile log. The copied .ex5 is still available."
    }
}

Write-Host "EA is available in Navigator: Expert Advisors -> $InstallFolderName -> TradeSyncProbeEA"
