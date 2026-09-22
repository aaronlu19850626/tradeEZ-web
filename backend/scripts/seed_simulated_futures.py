"""Seed two simulated CNY futures accounts with realistic closed trades.

Developer-only utility. It writes directly to the local PostgreSQL database and
keeps the existing MT5 simulator untouched.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

import psycopg


SHANGHAI = ZoneInfo("Asia/Shanghai")
START_DAY = date(2024, 9, 1)
END_DAY = date(2026, 8, 31)

PLANS = [
    {
        "label": "Sim-CTP-Commodity-A",
        "login": 990000001,
        "broker_server": "Simulated-CTP-Commodity",
        "count": 5000,
        "symbols": ["RB", "CU", "AU", "AG", "RU", "I", "MA", "TA", "SC"],
    },
    {
        "label": "Sim-CTP-Financial-B",
        "login": 990000002,
        "broker_server": "Simulated-CTP-Financial",
        "count": 5000,
        "symbols": ["IF", "IH", "IC", "IM", "T", "TF", "TS", "RB", "AU"],
    },
]

FUTURES_SPECS = {
    "RB": {
        "exchange": "SHFE",
        "digits": 1,
        "point": 1.0,
        "contract_size": 10.0,
        "base_price": 3500.0,
        "sigma_day": 80.0,
        "commission_lot": 2.4,
        "max_volume": 20,
    },
    "CU": {
        "exchange": "SHFE",
        "digits": 0,
        "point": 10.0,
        "contract_size": 5.0,
        "base_price": 72000.0,
        "sigma_day": 900.0,
        "commission_lot": 30.0,
        "max_volume": 10,
    },
    "AU": {
        "exchange": "SHFE",
        "digits": 2,
        "point": 0.02,
        "contract_size": 1000.0,
        "base_price": 550.0,
        "sigma_day": 8.0,
        "commission_lot": 20.0,
        "max_volume": 12,
    },
    "AG": {
        "exchange": "SHFE",
        "digits": 0,
        "point": 1.0,
        "contract_size": 15.0,
        "base_price": 7500.0,
        "sigma_day": 180.0,
        "commission_lot": 1.5,
        "max_volume": 20,
    },
    "RU": {
        "exchange": "SHFE",
        "digits": 0,
        "point": 5.0,
        "contract_size": 10.0,
        "base_price": 14000.0,
        "sigma_day": 350.0,
        "commission_lot": 6.0,
        "max_volume": 12,
    },
    "I": {
        "exchange": "DCE",
        "digits": 1,
        "point": 0.5,
        "contract_size": 100.0,
        "base_price": 800.0,
        "sigma_day": 25.0,
        "commission_lot": 10.0,
        "max_volume": 20,
    },
    "MA": {
        "exchange": "CZCE",
        "digits": 0,
        "point": 1.0,
        "contract_size": 10.0,
        "base_price": 2500.0,
        "sigma_day": 75.0,
        "commission_lot": 3.0,
        "max_volume": 20,
    },
    "TA": {
        "exchange": "CZCE",
        "digits": 0,
        "point": 2.0,
        "contract_size": 5.0,
        "base_price": 5500.0,
        "sigma_day": 150.0,
        "commission_lot": 3.0,
        "max_volume": 20,
    },
    "SC": {
        "exchange": "INE",
        "digits": 1,
        "point": 0.1,
        "contract_size": 1000.0,
        "base_price": 600.0,
        "sigma_day": 14.0,
        "commission_lot": 20.0,
        "max_volume": 10,
    },
    "IF": {
        "exchange": "CFFEX",
        "digits": 1,
        "point": 0.2,
        "contract_size": 300.0,
        "base_price": 3800.0,
        "sigma_day": 65.0,
        "commission_lot": 46.0,
        "max_volume": 8,
    },
    "IH": {
        "exchange": "CFFEX",
        "digits": 1,
        "point": 0.2,
        "contract_size": 300.0,
        "base_price": 2600.0,
        "sigma_day": 45.0,
        "commission_lot": 40.0,
        "max_volume": 8,
    },
    "IC": {
        "exchange": "CFFEX",
        "digits": 1,
        "point": 0.2,
        "contract_size": 200.0,
        "base_price": 5500.0,
        "sigma_day": 90.0,
        "commission_lot": 40.0,
        "max_volume": 8,
    },
    "IM": {
        "exchange": "CFFEX",
        "digits": 1,
        "point": 0.2,
        "contract_size": 200.0,
        "base_price": 6000.0,
        "sigma_day": 100.0,
        "commission_lot": 40.0,
        "max_volume": 8,
    },
    "T": {
        "exchange": "CFFEX",
        "digits": 3,
        "point": 0.005,
        "contract_size": 10000.0,
        "base_price": 105.0,
        "sigma_day": 0.32,
        "commission_lot": 6.0,
        "max_volume": 20,
    },
    "TF": {
        "exchange": "CFFEX",
        "digits": 3,
        "point": 0.005,
        "contract_size": 10000.0,
        "base_price": 103.0,
        "sigma_day": 0.26,
        "commission_lot": 6.0,
        "max_volume": 20,
    },
    "TS": {
        "exchange": "CFFEX",
        "digits": 3,
        "point": 0.002,
        "contract_size": 20000.0,
        "base_price": 102.0,
        "sigma_day": 0.16,
        "commission_lot": 6.0,
        "max_volume": 20,
    },
}

STRATEGIES = [
    ("趋势突破", 920717),
    ("日内动量", 202609),
    ("均值回归", 880031),
    ("开盘区间", 660118),
    ("夜盘跟随", 771205),
]

MARKET_HOLIDAYS = {
    date(2024, 10, 1),
    date(2024, 10, 2),
    date(2024, 10, 3),
    date(2024, 10, 4),
    date(2024, 10, 7),
    date(2025, 1, 1),
    date(2025, 1, 28),
    date(2025, 1, 29),
    date(2025, 1, 30),
    date(2025, 1, 31),
    date(2025, 2, 3),
    date(2025, 2, 4),
    date(2025, 5, 1),
    date(2025, 5, 5),
    date(2025, 10, 1),
    date(2025, 10, 2),
    date(2025, 10, 3),
    date(2025, 10, 6),
    date(2025, 10, 7),
    date(2026, 1, 1),
    date(2026, 1, 2),
    date(2026, 2, 16),
    date(2026, 2, 17),
    date(2026, 2, 18),
    date(2026, 2, 19),
    date(2026, 2, 20),
    date(2026, 5, 1),
    date(2026, 5, 4),
    date(2026, 5, 5),
}

DEAL_COLUMNS = (
    "account_login, ticket, position_id, order_id, symbol, entry, type, volume, "
    "price, sl_price, tp_price, profit, swap, commission, magic, comment, "
    "open_time, deal_time, server_gmt_off, raw_json"
)


def _epoch(value: datetime) -> int:
    return int(value.timestamp())


def _is_trading_day(value: date) -> bool:
    return value.weekday() < 5 and value not in MARKET_HOLIDAYS


def _random_trading_day(rng: random.Random) -> date:
    while True:
        span = (END_DAY - START_DAY).days
        candidate = START_DAY + timedelta(days=rng.randint(0, span))
        if _is_trading_day(candidate):
            return candidate


def _session_for_symbol(rng: random.Random, symbol: str) -> tuple[time, time]:
    if symbol in {"IF", "IH", "IC", "IM", "T", "TF", "TS"}:
        return rng.choice(((time(9, 30), time(11, 30)), (time(13, 0), time(15, 0))))
    if symbol in {"CU", "AU", "AG", "RU", "SC", "TA", "MA", "I"} and rng.random() < 0.38:
        return rng.choice(((time(21, 0), time(23, 0)), (time(21, 0), time(1, 0))))
    return rng.choice(((time(9, 0), time(11, 30)), (time(13, 30), time(15, 0))))


def _sample_open_time(rng: random.Random, symbol: str) -> int:
    for _ in range(100):
        day = _random_trading_day(rng)
        start_time, end_time = _session_for_symbol(rng, symbol)
        start_dt = datetime.combine(day, start_time, tzinfo=SHANGHAI)
        end_day = day + timedelta(days=1) if end_time <= start_time else day
        end_dt = datetime.combine(end_day, end_time, tzinfo=SHANGHAI)
        start_epoch = _epoch(start_dt)
        end_epoch = _epoch(end_dt)
        if end_epoch <= start_epoch:
            continue
        minute = rng.randint(0, max(0, int((end_epoch - start_epoch) / 60) - 1))
        return start_epoch + minute * 60 + rng.choice((0, 15, 30, 45))
    raise RuntimeError(f"Unable to sample a session for {symbol}")


def _sample_duration_seconds(rng: random.Random) -> int:
    roll = rng.random()
    if roll < 0.47:
        return int(rng.uniform(60, 30 * 60))
    if roll < 0.72:
        return int(rng.uniform(30 * 60, 2 * 3600))
    if roll < 0.86:
        return int(rng.uniform(2 * 3600, 4 * 3600))
    if roll < 0.94:
        return int(rng.uniform(4 * 3600, 8 * 3600))
    if roll < 0.98:
        return int(rng.uniform(8 * 3600, 24 * 3600))
    return int(rng.uniform(24 * 3600, 5 * 24 * 3600))


def _sample_volume(rng: random.Random, symbol: str, max_volume: int) -> int:
    if symbol in {"IF", "IH", "IC", "IM"}:
        return min(max_volume, max(1, int(round(rng.triangular(1, 5, 1)))))
    if symbol in {"T", "TF", "TS"}:
        return min(max_volume, max(1, int(round(rng.triangular(1, 12, 2)))))
    return min(max_volume, max(1, int(round(rng.triangular(1, 12, 3)))))


def _tick_round(value: float, point: float) -> float:
    return round(round(value / point) * point, 8)


def _sample_sl_tp_mode(rng: random.Random) -> str:
    roll = rng.random()
    if roll < 0.52:
        return "both"
    if roll < 0.72:
        return "sl"
    if roll < 0.84:
        return "tp"
    return "none"


def _build_trade(
    rng: random.Random,
    login: int,
    symbol: str,
    position_id: int,
    ticket_base: int,
) -> tuple[list[tuple], int]:
    spec = FUTURES_SPECS[symbol]
    point = float(spec["point"])
    contract_size = float(spec["contract_size"])
    tick_value = point * contract_size
    digits = int(spec["digits"])
    side = rng.randint(0, 1)
    volume = _sample_volume(rng, symbol, int(spec["max_volume"]))

    years_span = (END_DAY - START_DAY).days / 365.25
    open_price = float(spec["base_price"]) + rng.gauss(0, float(spec["sigma_day"]) * math.sqrt(years_span) * 0.35)
    open_price = _tick_round(max(point, open_price), point)
    open_time = _sample_open_time(rng, symbol)
    duration = _sample_duration_seconds(rng)
    close_time = open_time + max(1, duration)
    end_epoch = _epoch(datetime.combine(END_DAY, time(23, 59, 59), tzinfo=SHANGHAI))
    close_time = min(close_time, end_epoch)
    if close_time <= open_time:
        close_time = open_time + 60

    duration_days = max((close_time - open_time) / 86_400, 1 / 86_400)
    sigma = float(spec["sigma_day"]) * math.sqrt(duration_days)
    directional_edge = rng.gauss(0.055, 0.18) * sigma
    move = rng.gauss(0, sigma) + (directional_edge if side == 0 else -directional_edge)
    close_price = _tick_round(max(point, open_price + move), point)

    price_delta = close_price - open_price
    profit = (price_delta / point) * tick_value * volume
    if side == 1:
        profit = -profit
    profit = round(profit, 2)
    commission = -round(float(spec["commission_lot"]) * volume, 2)
    strategy, magic = rng.choice(STRATEGIES)

    mode = _sample_sl_tp_mode(rng)
    sl_price = None
    tp_price = None
    sl_distance = sigma * rng.uniform(0.35, 0.9)
    tp_distance = sigma * rng.uniform(0.7, 1.8)
    if side == 0:
        if mode in {"both", "sl"}:
            sl_price = _tick_round(max(point, open_price - sl_distance), point)
        if mode in {"both", "tp"}:
            tp_price = _tick_round(open_price + tp_distance, point)
    else:
        if mode in {"both", "sl"}:
            sl_price = _tick_round(open_price + sl_distance, point)
        if mode in {"both", "tp"}:
            tp_price = _tick_round(max(point, open_price - tp_distance), point)

    open_ticket = ticket_base
    close_ticket = ticket_base + 1
    raw = {
        "exchange": spec["exchange"],
        "product": symbol,
        "contract_multiplier": contract_size,
        "price_tick": point,
    }

    def deal(ticket: int, entry: int, deal_type: int, price: float, deal_time: int, pnl: float, comm: float) -> tuple:
        raw_json = json.dumps(
            {
                **raw,
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
                "swap": 0.0,
                "commission": comm,
                "magic": magic,
                "comment": strategy,
                "open_time": open_time,
                "deal_time": deal_time,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return (
            login,
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
            0.0,
            comm,
            magic,
            strategy,
            open_time,
            deal_time,
            0,
            raw_json,
        )

    deals = [
        deal(open_ticket, 0, side, open_price, open_time, 0.0, 0.0),
        deal(close_ticket, 1, 1 - side, close_price, close_time, profit, commission),
    ]
    return deals, close_ticket + 1


def _insert_account(conn: psycopg.Connection, user_id: int, plan: dict) -> int:
    prefix = f"sim-{plan['login']}-{uuid.uuid4().hex[:8]}"
    key_hash = uuid.uuid4().hex
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO accounts (
                user_id, mt5_login, label, broker_server, platform, account_currency,
                market_profile, key_prefix, key_hash, key_created_at, sync_start_time,
                last_sync_time, is_statistics, updated_at
            ) VALUES (
                %s, %s, %s, %s, 'ctp', 'CNY', 'cn', %s, %s, now_iso(), %s, 0, 1, now_iso()
            )
            RETURNING id
            """,
            (
                user_id,
                plan["login"],
                plan["label"],
                plan["broker_server"],
                prefix,
                key_hash,
                _epoch(datetime.combine(START_DAY, time.min, tzinfo=SHANGHAI)),
            ),
        )
        return int(cur.fetchone()[0])


def _insert_symbols(conn: psycopg.Connection, login: int, symbols: list[str]) -> None:
    rows = []
    for symbol in symbols:
        spec = FUTURES_SPECS[symbol]
        rows.append(
            (
                login,
                symbol,
                spec["digits"],
                spec["point"],
                spec["contract_size"],
                float(spec["point"]) * float(spec["contract_size"]),
                spec["point"],
                "CNY",
                "CNY",
                json.dumps(
                    {
                        "exchange": spec["exchange"],
                        "product": symbol,
                        "contract_multiplier": spec["contract_size"],
                        "price_tick": spec["point"],
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            )
        )
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO symbols (
                account_login, symbol, digits, point, contract_size, tick_value,
                tick_size, currency_base, currency_profit, raw_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (account_login, symbol) DO UPDATE SET
                digits = EXCLUDED.digits,
                point = EXCLUDED.point,
                contract_size = EXCLUDED.contract_size,
                tick_value = EXCLUDED.tick_value,
                tick_size = EXCLUDED.tick_size,
                currency_base = EXCLUDED.currency_base,
                currency_profit = EXCLUDED.currency_profit,
                raw_json = EXCLUDED.raw_json,
                updated_at = now_iso()
            """,
            rows,
        )


def _reset_existing(conn: psycopg.Connection) -> None:
    logins = [int(plan["login"]) for plan in PLANS]
    with conn.cursor() as cur:
        for login in logins:
            for table in (
                "sync_batch_refs",
                "deals",
                "snapshots",
                "symbols",
                "ea_settings_history",
                "heartbeat_history",
                "heartbeats",
                "trade_dirty_positions",
                "closed_trades",
                "accounts",
            ):
                cur.execute(f"DELETE FROM {table} WHERE account_login = %s" if table != "accounts" else "DELETE FROM accounts WHERE mt5_login = %s", (login,))
    conn.commit()


def _insert_snapshot(conn: psycopg.Connection, login: int, timestamp: int, balance: float, equity: float) -> None:
    raw = json.dumps(
        {
            "account": login,
            "balance": round(balance, 2),
            "equity": round(equity, 2),
            "margin": 0.0,
            "free_margin": round(equity, 2),
            "snapshot_time": timestamp,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO snapshots (
                account_login, timestamp, balance, equity, margin, free_margin,
                margin_level, raw_json
            ) VALUES (%s, %s, %s, %s, 0, %s, NULL, %s)
            ON CONFLICT (account_login, timestamp) DO UPDATE SET
                balance = EXCLUDED.balance,
                equity = EXCLUDED.equity,
                free_margin = EXCLUDED.free_margin,
                raw_json = EXCLUDED.raw_json,
                received_at = now_iso()
            """,
            (login, timestamp, round(balance, 2), round(equity, 2), round(equity, 2), raw),
        )


def seed(conn: psycopg.Connection | None, user_id: int, *, dry_run: bool, reset: bool) -> None:
    total = sum(int(plan["count"]) for plan in PLANS)
    if dry_run:
        print(f"DRY RUN: {len(PLANS)} CTP accounts, {total} trades, {total * 2} deals")
        for plan in PLANS:
            print(
                f"  {plan['label']} login={plan['login']} trades={plan['count']} "
                f"symbols={','.join(plan['symbols'])}"
            )
        return

    if conn is None:
        raise RuntimeError("Database connection is required when not running a dry run")

    if reset:
        _reset_existing(conn)

    deal_sql = (
        f"INSERT INTO deals ({DEAL_COLUMNS}) VALUES "
        "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
    )
    rng = random.Random(20260922)
    for plan_index, plan in enumerate(PLANS, start=1):
        login = int(plan["login"])
        account_id = _insert_account(conn, user_id, plan)
        _insert_symbols(conn, login, list(plan["symbols"]))
        print(
            f"seeding {plan['label']} account_id={account_id} trades={plan['count']}",
            flush=True,
        )

        ticket = 9_800_000_000 + plan_index * 1_000_000
        position_id = 98_000_000 + plan_index * 1_000_000
        pending: list[tuple] = []
        net_pnl = 0.0

        for index in range(int(plan["count"])):
            symbol = rng.choices(
                list(plan["symbols"]),
                weights=[3.0 if item in {"RB", "IF", "AU", "CU"} else 1.0 for item in plan["symbols"]],
                k=1,
            )[0]
            deals, ticket = _build_trade(rng, login, symbol, position_id, ticket)
            close_profit = float(deals[-1][11])
            close_commission = float(deals[-1][13])
            net_pnl += close_profit + close_commission
            position_id += 1
            pending.extend(deals)
            if len(pending) >= 2000:
                with conn.cursor() as cur:
                    with conn.pipeline():
                        cur.executemany(deal_sql, pending)
                pending = []
            if index and index % 1000 == 0:
                print(f"  {plan['label']}: {index}/{plan['count']}", flush=True)

        if pending:
            with conn.cursor() as cur:
                with conn.pipeline():
                    cur.executemany(deal_sql, pending)
        conn.commit()

        start_snapshot = _epoch(datetime.combine(START_DAY, time(8, 30), tzinfo=SHANGHAI))
        end_snapshot = _epoch(datetime.combine(END_DAY, time(16, 0), tzinfo=SHANGHAI))
        _insert_snapshot(conn, login, start_snapshot, 1_000_000.0, 1_000_000.0)
        _insert_snapshot(conn, login, end_snapshot, 1_000_000.0 + net_pnl, 1_000_000.0 + net_pnl)
        conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT refresh_closed_trades()")
    conn.commit()
    print("done", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed simulated CTP futures closed trades")
    parser.add_argument("--commit", action="store_true", help="Actually write to the database")
    parser.add_argument("--reset", action="store_true", help="Delete the two fixed simulated CTP logins first")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan without connecting")
    args = parser.parse_args()

    load_dotenv(".env", override=False)
    if args.dry_run or not args.commit:
        seed(None, 0, dry_run=True, reset=args.reset)
        return 0

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
        seed(conn, int(row[0]), dry_run=False, reset=args.reset)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
