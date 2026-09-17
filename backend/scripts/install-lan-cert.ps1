# 在“远程电脑”上运行，用于信任 TradeSync 局域网 HTTPS 开发证书。
# 用法：右键 PowerShell“以管理员身份运行”，执行：
# powershell -ExecutionPolicy Bypass -File .\install-lan-cert.ps1

$ErrorActionPreference = "Stop"
$certPath = Join-Path $PSScriptRoot "..\certs\lan-server.cer"
$resolved = (Resolve-Path $certPath).Path
Import-Certificate -CertStoreLocation "Cert:\LocalMachine\Root" -FilePath $resolved | Out-Null
Write-Host "已信任 TradeSync LAN 证书：$resolved"