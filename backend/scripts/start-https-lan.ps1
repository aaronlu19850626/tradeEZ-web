# 启动局域网可访问的 TradeSync HTTPS 开发服务。
# 先运行一次 allow-firewall-8443.ps1（需要管理员），以后运行本脚本即可。

$ErrorActionPreference = "Stop"
$backendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $backendRoot

& .\venv\Scripts\python.exe -m uvicorn app.main:app `
  --host 0.0.0.0 `
  --port 8443 `
  --ssl-certfile .\certs\lan-server.pem `
  --ssl-keyfile .\certs\lan-server.key