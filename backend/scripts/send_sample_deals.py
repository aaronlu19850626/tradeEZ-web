"""Send two sample MT5 deals to the local API v2 using only the Python standard library.

Usage:
    $env:TRADESYNC_SYNC_KEY='sk_live_...'
    python scripts/send_sample_deals.py

The default dev key only works if TRADESYNC_SYNC_KEY=dev-sync-key-change-me on the server
and the MT5 account has already been bound in the web console.
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone

BASE_URL = os.getenv("TRADESYNC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
SYNC_KEY = os.getenv("TRADESYNC_SYNC_KEY", "dev-sync-key-change-me")
ACCOUNT_LOGIN = int(os.getenv("TRADESYNC_SAMPLE_LOGIN", "88973405"))
SERVER_GMT_OFF = int(os.getenv("TRADESYNC_SERVER_GMT_OFF", "10800"))

now = int(datetime.now(tz=timezone.utc).timestamp())
open_time = now - 3600
close_time = now - 600

payload = {
    "mt5_login": ACCOUNT_LOGIN,
    "server_gmt_off": SERVER_GMT_OFF,
    "last_deal_time": close_time,
    "deals": [
        {
            "deal_ticket": 910000001,
            "order_ticket": 910000001,
            "position_id": 910000001,
            "symbol": "GOLD#",
            "deal_type": "BUY",
            "entry_type": "IN",
            "deal_time": open_time,
            "price": 4061.80,
            "volume": 0.10,
            "commission": -0.70,
            "swap": 0.0,
            "profit": 0.0,
            "sl": 4056.80,
            "tp": 0.0,
            "comment": "TradeEZ-TR open",
            "magic": 920718,
        },
        {
            "deal_ticket": 910000002,
            "order_ticket": 910000002,
            "position_id": 910000001,
            "symbol": "GOLD#",
            "deal_type": "SELL",
            "entry_type": "OUT",
            "deal_time": close_time,
            "price": 4066.30,
            "volume": 0.10,
            "commission": -0.70,
            "swap": -1.20,
            "profit": 45.0,
            "sl": 0.0,
            "tp": 0.0,
            "comment": "manual close",
            "magic": 0,
        },
    ],
}


def request(method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {SYNC_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


if __name__ == "__main__":
    print("POST /api/v1/sync/last_sync_time")
    print(json.dumps(request("POST", "/api/v1/sync/last_sync_time", {"mt5_login": ACCOUNT_LOGIN}), indent=2))

    print("\nPOST /api/v1/ingest/deals")
    print(json.dumps(request("POST", "/api/v1/ingest/deals", payload), indent=2))

    print("\nPOST /api/v1/sync/heartbeat")
    print(
        json.dumps(
            request(
                "POST",
                "/api/v1/sync/heartbeat",
                {"mt5_login": ACCOUNT_LOGIN, "timestamp": now, "version": "2.00-sample"},
            ),
            indent=2,
        )
    )

    print("\nGET /api/v1/positions (legacy dashboard pairing API)")
    print(
        json.dumps(
            request("GET", f"/api/v1/positions?account_login={ACCOUNT_LOGIN}"),
            indent=2,
        )
    )

    print("\nTip: run this script twice. The second upload should report duplicates=2.")
