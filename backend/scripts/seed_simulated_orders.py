"""Seed a local account with simulated MT5 closed trades.

This is a developer-only utility. It writes directly to the configured local
PostgreSQL database and is intentionally separate from the EA sync path.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

import psycopg


PLANS = [
    {"label": "Sim-Gold-A", "login": 880000001, "start": "2016-01-01", "end": "2019-12-31", "count": 15000},
    {"label": "Sim-Gold-B", "login": 880000002, "start": "2018-01-01", "end": "2023-12-31", "count": 25000},
    {"label": "Sim-Gold-C", "login": 880000003, "start": "2014-01-01", "end": "2024-12-31", "count": 35000},
    {"label": "Sim-Gold-D", "login": 880000004, "start": "2019-01-01", "end": "2025-12-31", "count": 50000},
]

SYMBOL_WEIGHTS = [
    ("XAUUSD", 0.70),
    ("EURUSD", 0.10),
    ("GBPUSD", 0.06),
    ("USDJPY", 0.06),
    ("AUDUSD", 0.04),
    ("USDCHF", 0.04),
]

SPECS = {
    "XAUUSD": {"digits": 2, "point": 0.01, "contract_size": 100.0, "tick_value": 1.0, "base_price": 1800.0, "sigma_day": 12.0, "swap_per_day": 8.0},
    "EURUSD": {"digits": 5, "point": 0.00001, "contract_size": 100000.0, "tick_value": 1.0, "base_price": 1.12, "sigma_day": 0.006, "swap_per_day": 3.0},
    "GBPUSD": {"digits": 5, "point": 0.00001, "contract_size": 100000.0, "tick_value": 1.0, "base_price": 1.30, "sigma_day": 0.008, "swap_per_day": 3.0},
    "USDJPY": {"digits": 3, "point": 0.001, "contract_size": 100000.0, "tick_value": 1.0, "base_price": 145.0, "sigma_day": 0.8, "swap_per_day": 2.0},
    "AUDUSD": {"digits": 5, "point": 0.00001, "contract_size": 100000.0, "tick_value": 1.0, "base_price": 0.68, "sigma_day": 0.006, "swap_per_day": 2.0},
    "USDCHF": {"digits": 5, "point": 0.00001, "contract_size": 100000.0, "tick_value": 1.0, "base_price": 0.92, "sigma_day": 0.006, "swap_per_day": 2.0},
}

MAGICS = [0, 100, 920717, 123456, 777001, 202609, 555]
COMMENTS = ["", "scalp", "intraday", "swing", "EA-Breakout", "manual", None]


def _epoch(value: str) -> int:
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp())


def _bj_day(epoch: int) -> int:
    return (epoch + 8 * 3600) // 86_400


def _round_price(value: float, digits: int) -> float:
    factor = 10**digits
    return round(value * factor) / factor


def _sample_symbol(rng: random.Random) -> str:
    roll = rng.random()
    cursor = 0.0
    for symbol, weight in SYMBOL_WEIGHTS:
        cursor += weight
        if roll <= cursor:
            return symbol
    return "XAUUSD"


def _sample_volume(rng: random.Random) -> float:
    # Most trades sit in the 0.3-0.5 lots band, with rare tails to 3 lots.
    mode = rng.choice([0.3, 0.4, 0.5])
    spread = rng.choice([0.1, 0.2, 0.3])
    value = mode + rng.gauss(0, spread)
    return max(0.05, min(3.0, round(value, 2)))


def _sample_duration(rng: random.Random) -> int:
    roll = rng.random()
    if roll < 0.08:
        return int(rng.uniform(2, 60))
    if roll < 0.26:
        return int(rng.uniform(60, 600))
    if roll < 0.48:
        return int(rng.uniform(600, 3600))
    if roll < 0.72:
        return int(rng.uniform(3600, 6 * 3600))
    if roll < 0.86:
        return int(rng.uniform(6 * 3600, 24 * 3600))
    if roll < 0.96:
        return int(rng.uniform(24 * 3600, 3 * 24 * 3600))
    return int(rng.uniform(3 * 24 * 3600, 10 * 24 * 3600))


def _sl_tp_mode(rng: random.Random) -> str:
    roll = rng.random()
    if roll < 0.55:
        return "both"
    if roll < 0.70:
        return "sl"
    if roll < 0.80:
        return "tp"
    return "none"


def _build_trade(rng: random.Random, account_login: int, start_epoch: int, end_epoch: int, position_id: int, ticket_base: int) -> tuple[list[tuple], int]:
    symbol = _sample_symbol(rng)
    spec = SPECS[symbol]
    digits = spec["digits"]
    point = spec["point"]
    contract_size = spec["contract_size"]
    base_price = spec["base_price"]
    sigma_day = spec["sigma_day"]
    swap_per_day = spec["swap_per_day"]

    side = rng.randint(0, 1)  # 0 buy, 1 sell
    volume = _sample_volume(rng)

    years_span = max(1, (end_epoch - start_epoch) / 31_536_000)
    open_price = _round_price(base_price + rng.gauss(0, sigma_day * math.sqrt(365 * years_span) * 0.35), digits)
    open_price = max(point, open_price)

    open_time = int(rng.uniform(start_epoch, end_epoch - 1))
    duration = _sample_duration(rng)
    close_time = min(open_time + max(1, duration), end_epoch)
    if close_time <= open_time:
        close_time = open_time + 1

    duration_days = max((close_time - open_time) / 86_400, 1.0 / 86_400)
    move = rng.gauss(0, sigma_day * math.sqrt(duration_days))
    close_price = _round_price(max(point, open_price + move), digits)

    ticks = (close_price - open_price) / point
    if side == 0:
        profit = round(ticks * spec["tick_value"] * volume, 2)
    else:
        profit = round(-ticks * spec["tick_value"] * volume, 2)

    swap = 0.0
    if _bj_day(close_time) != _bj_day(open_time):
        days_held = _bj_day(close_time) - _bj_day(open_time)
        sign = -1.0 if rng.random() < 0.62 else 1.0
        swap = round(sign * swap_per_day * days_held * volume, 2)

    commission = round(-6.0 * volume, 2) if rng.random() < 0.25 else 0.0

    mode = _sl_tp_mode(rng)
    sl_price = None
    tp_price = None
    sl_distance = sigma_day * (0.25 + rng.random() * 0.75)
    tp_distance = sigma_day * (0.5 + rng.random() * 1.5)
    if side == 0:
        if mode in {"both", "sl"}:
            sl_price = _round_price(max(point, open_price - sl_distance), digits)
        if mode in {"both", "tp"}:
            tp_price = _round_price(open_price + tp_distance, digits)
    else:
        if mode in {"both", "sl"}:
            sl_price = _round_price(open_price + sl_distance, digits)
        if mode in {"both", "tp"}:
            tp_price = _round_price(max(point, open_price - tp_distance), digits)

    magic = rng.choice(MAGICS)
    comment = rng.choice(COMMENTS)
    open_ticket = ticket_base
    close_ticket = ticket_base + 1

    def deal(ticket: int, entry: int, deal_type: int, price: float, deal_time: int, pnl: float, swp: float, comm: float) -> tuple:
        raw = json.dumps(
            {
                "ticket": ticket,
                "position_id": position_id,
                "symbol": symbol,
                "entry": entry,
                "type": deal_type,
                "volume": volume,
                "price": price,
                "sl_price": sl_price,
                "tp_price": tp_price,
                "profit": pnl,
                "swap": swp,
                "commission": comm,
                "magic": magic,
                "comment": comment or "",
                "open_time": open_time,
                "deal_time": deal_time,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return (
            account_login,
            ticket,
            position_id,
            open_ticket,
            symbol,
            entry,
            deal_type,
            volume,
            price,
            sl_price,
            tp_price,
            pnl,
            swp,
            comm,
            magic,
            comment,
            open_time,
            deal_time,
            0,
            raw,
        )

    deals = [
        deal(open_ticket, 0, side, open_price, open_time, 0.0, 0.0, 0.0),
        deal(close_ticket, 1, 1 - side, close_price, close_time, profit, swap, commission),
    ]
    return deals, close_ticket + 1


DEAL_COLUMNS = (
    "account_login, ticket, position_id, order_id, symbol, entry, type, volume, "
    "price, sl_price, tp_price, profit, swap, commission, magic, comment, "
    "open_time, deal_time, server_gmt_off, raw_json"
)


def _insert_account(conn: psycopg.Connection, user_id: int, plan: dict) -> int:
    prefix = f"sim-{plan['login']}-{uuid.uuid4().hex[:8]}"
    key_hash = uuid.uuid4().hex
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO accounts (
                user_id, mt5_login, label, broker_server, platform, account_currency,
                key_prefix, key_hash, key_created_at, sync_start_time, last_sync_time,
                is_statistics, updated_at
            ) VALUES (%s, %s, %s, %s, 'mt5', 'USD', %s, %s, now_iso(), %s, 0, 1, now_iso())
            RETURNING id
            """,
            (user_id, plan["login"], plan["label"], "Simulated-MT5", prefix, key_hash, _epoch(plan["start"])),
        )
        account_id = cur.fetchone()[0]
    return account_id


def _insert_symbols(conn: psycopg.Connection, login: int) -> None:
    rows = []
    for symbol, spec in SPECS.items():
        base = "XAU" if symbol == "XAUUSD" else symbol[:3]
        quote = "USD" if symbol != "USDJPY" else "JPY"
        rows.append(
            (
                login,
                symbol,
                spec["digits"],
                spec["point"],
                spec["contract_size"],
                spec["tick_value"],
                spec["point"],
                base,
                quote,
                "{}",
            )
        )
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO symbols (
                account_login, symbol, digits, point, contract_size, tick_value,
                tick_size, currency_base, currency_profit, raw_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (account_login, symbol) DO NOTHING
            """,
            rows,
        )


def seed(conn: psycopg.Connection, user_id: int, dry_run: bool = False) -> None:
    if dry_run:
        total = sum(plan["count"] for plan in PLANS)
        print(f"DRY RUN: {len(PLANS)} accounts, {total} trades, {total * 2} deals")
        for plan in PLANS:
            print(f"  {plan['label']} login={plan['login']} {plan['start']}..{plan['end']} trades={plan['count']}")
        return

    deal_sql = (
        f"INSERT INTO deals ({DEAL_COLUMNS}) VALUES "
        "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
    )
    batch_size = 2000

    for plan in PLANS:
        account_id = _insert_account(conn, user_id, plan)
        login = plan["login"]
        _insert_symbols(conn, login)
        print(f"seeding {plan['label']} account_id={account_id} trades={plan['count']}", flush=True)

        start_epoch = _epoch(plan["start"])
        end_epoch = min(_epoch(plan["end"]) + 86_399, int(datetime.now(timezone.utc).timestamp()))
        rng = random.Random(plan["login"])
        ticket = 1
        position_id = 10_000_000 + plan["login"]
        pending: list[tuple] = []

        for index in range(plan["count"]):
            deals, ticket = _build_trade(rng, login, start_epoch, end_epoch, position_id, ticket)
            position_id += 1
            pending.extend(deals)
            if len(pending) >= batch_size:
                with conn.cursor() as cur:
                    with conn.pipeline():
                        cur.executemany(deal_sql, pending)
                pending = []
            if index and index % 5000 == 0:
                print(f"  {plan['label']}: {index}/{plan['count']}", flush=True)

        if pending:
            with conn.cursor() as cur:
                with conn.pipeline():
                    cur.executemany(deal_sql, pending)
        conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT refresh_closed_trades()")
    conn.commit()
    print("done", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed simulated MT5 closed trades")
    parser.add_argument("--commit", action="store_true", help="Actually write to the database")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan without connecting")
    args = parser.parse_args()

    load_dotenv(".env", override=False)
    database_url = os.environ.get("TRADESYNC_DATABASE_URL")
    if not database_url:
        print("TRADESYNC_DATABASE_URL is required", file=sys.stderr)
        return 2

    with psycopg.connect(database_url, connect_timeout=10, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s OR phone = %s", ("chentodd@qq.com", "chentodd@qq.com"))
            row = cur.fetchone()
        if row is None:
            print("User chentodd@qq.com was not found", file=sys.stderr)
            return 1
        user_id = int(row[0])

        if args.dry_run or not args.commit:
            seed(conn, user_id, dry_run=True)
            return 0
        seed(conn, user_id, dry_run=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
