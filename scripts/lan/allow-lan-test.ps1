# Run as administrator. Restrict testing to this WLAN IP and its local subnet.
$ErrorActionPreference = 'Stop'
foreach ($port in @(3000,8000)) {
    $ruleName = "TradeSync-LAN-Test-$port"
    if (!(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $port -LocalAddress '192.168.31.116' -RemoteAddress LocalSubnet -Profile Private | Out-Null
    }
}
