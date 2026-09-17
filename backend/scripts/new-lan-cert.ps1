# Generate a local HTTPS certificate for LAN development.
# Example: .\scripts\new-lan-cert.ps1 -IpAddress 192.168.31.116 -ExtraHost JKLCHEN
param(
    [string]$IpAddress = "",
    [string]$ExtraHost = ""
)

$ErrorActionPreference = "Stop"
$backendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $backendRoot

$python = ".\venv\Scripts\python.exe"
if(-not (Test-Path $python)) { $python = "python" }

$arguments = @(".\scripts\generate_lan_cert.py", "--target", "certs")
if($IpAddress) { $arguments += @("--ident", $IpAddress) }
if($ExtraHost) { $arguments += @("--ident", $ExtraHost) }

& $python $arguments

