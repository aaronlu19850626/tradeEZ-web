$ErrorActionPreference = "Stop"
$ruleName = "TradeSync HTTPS 8443"
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Private,Domain | Out-Null
Write-Output "Firewall rule '$ruleName' created."