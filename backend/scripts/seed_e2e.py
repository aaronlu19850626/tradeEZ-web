"""Deterministic browser fixtures; only an empty, explicitly named E2E database."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> None:
    url = os.environ.get("TRADEEZ_E2E_DATABASE_URL", "")
    if not url or not urlsplit(url).path.lstrip("/").startswith("tradeez_e2e_"):
        raise SystemExit("Set TRADEEZ_E2E_DATABASE_URL to an empty tradeez_e2e_* database")
    # Override local .env before importing application settings or migrations.
    os.environ["TRADESYNC_DATABASE_URL"] = url
    os.environ["TRADESYNC_ENVIRONMENT"] = "test"
    from app.migrations import upgrade_database

    upgrade_database()
    names = ["Sim-Gold-A", "Sim-Gold-B", "Sim-Gold-C", "Sim-Gold-D",
             "Sim-CTP-Commodity-A", "Sim-CTP-Financial-B"]
    now = int(time.time())
    with psycopg.connect(url) as db:
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            raise SystemExit("Fixture database is not empty; create a new dedicated E2E database")
        uid = db.execute("INSERT INTO users (email) VALUES ('e2e@example.com') RETURNING id").fetchone()[0]
        for index, name in enumerate(names):
            login = 992000001 + index
            domestic = index >= 4
            db.execute(
                """INSERT INTO accounts (user_id, mt5_login, label, broker_server,
                    platform, account_currency, market_profile, key_prefix, key_hash,
                    is_statistics, sync_start_time)
                    VALUES (%s,%s,%s,'E2E-Synthetic',%s,%s,%s,%s,%s,1,0)""",
                (uid, login, name, "ctp" if domestic else "mt5", "CNY" if domestic else "USD",
                 "cn" if domestic else "fx", f"e2e-{index}", hashlib.sha256(name.encode()).hexdigest()),
            )
            symbols = ["RB", "AU"] if domestic else ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"]
            for symbol in symbols:
                db.execute("""INSERT INTO symbols (account_login, symbol, digits, point, contract_size,
                    tick_value, tick_size, currency_base, currency_profit, raw_json)
                    VALUES (%s,%s,2,0.01,100,1,0.01,%s,%s,'{}')""",
                    (login, symbol, symbol[:3], "CNY" if domestic else "USD"))
            for n in range(240):
                close = now - 60 - n * 10800
                opened = close - 3600
                side = n % 2
                profit = 100 + n if n % 3 else -40 - n
                for entry in (0, 1):
                    db.execute("""INSERT INTO deals (account_login, ticket, position_id, order_id, symbol,
                        entry, type, volume, price, sl_price, tp_price, profit, swap, commission,
                        open_time, deal_time, server_gmt_off, raw_json)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,0.1,%s,1990,2020,%s,0,%s,%s,%s,0,'{}')""",
                        (login, n * 2 + entry + 1, n + 1000, n + 2000, symbols[n % len(symbols)],
                         entry, side if entry == 0 else 1 - side, 2000 if entry == 0 else 2010,
                         profit if entry else 0, -1 if entry else 0, opened, close if entry else opened))
            db.execute("""INSERT INTO snapshots (account_login, timestamp, balance, equity, margin,
                free_margin, margin_level, raw_json) VALUES (%s,%s,10000,10000,0,10000,NULL,'{}')""",
                (login, now))
        db.execute("SELECT refresh_closed_trades()")
    print("E2E fixtures ready: 1 synthetic user, 6 accounts, 1440 closed trades")


if __name__ == "__main__":
    main()
