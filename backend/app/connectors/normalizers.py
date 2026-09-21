from __future__ import annotations

import json

from app.db import DBConnection, DBRow
from app.timekeeping import observe_timezone_candidate, resolve_trade_times
from app.v2_models import ApiError


def _require(data: dict, key: str, event_type: str) -> float | int | str | None:
    if key not in data:
        raise ApiError(
            code="INVALID_EVENT_DATA",
            message=f"{event_type} event is missing required field {key}",
            status_code=422,
        )
    return data.get(key)


def normalize_mt5_event(account: DBRow, event_type: str, data: dict, db: DBConnection) -> None:
    login = int(account["mt5_login"])

    if event_type == "trade":
        resolved_open, resolved_deal, timezone_profile_id = resolve_trade_times(db, account, data)
        ticket = int(_require(data, "ticket", event_type))
        position_id = int(_require(data, "position_id", event_type))
        order_id = int(_require(data, "order_id", event_type))
        symbol = str(_require(data, "symbol", event_type))
        entry = int(_require(data, "entry", event_type))
        deal_type = int(_require(data, "type", event_type))
        volume = float(_require(data, "volume", event_type))
        price = float(_require(data, "price", event_type))
        sl_price = float(data.get("sl_price") or 0)
        tp_price = float(data.get("tp_price") or 0)
        profit = float(data.get("profit") or 0)
        swap = float(data.get("swap") or 0)
        commission = float(data.get("commission") or 0)
        magic = int(data.get("magic") or 0)
        comment = str(data.get("comment") or "")
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        db.execute(
            """
            INSERT INTO deals (
                account_login, ticket, position_id, order_id, symbol,
                entry, type, volume, price, sl_price, tp_price,
                profit, swap, commission, magic, comment,
                open_time, deal_time, server_gmt_off, raw_json,
                server_open_time, server_deal_time, timezone_profile_id, time_normalized_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now_iso())
            ON CONFLICT (account_login, ticket) DO UPDATE SET
                server_open_time=COALESCE(deals.server_open_time, excluded.server_open_time),
                server_deal_time=COALESCE(deals.server_deal_time, excluded.server_deal_time),
                timezone_profile_id=COALESCE(excluded.timezone_profile_id, deals.timezone_profile_id),
                open_time=CASE
                    WHEN excluded.timezone_profile_id IS NOT NULL OR deals.server_deal_time IS NULL
                    THEN excluded.open_time ELSE deals.open_time END,
                deal_time=CASE
                    WHEN excluded.timezone_profile_id IS NOT NULL OR deals.server_deal_time IS NULL
                    THEN excluded.deal_time ELSE deals.deal_time END,
                server_gmt_off=CASE
                    WHEN excluded.server_gmt_off <> 0 THEN excluded.server_gmt_off
                    ELSE deals.server_gmt_off END,
                time_normalized_at=now_iso()
            """,
            (
                login,
                ticket,
                position_id,
                order_id,
                symbol,
                entry,
                deal_type,
                volume,
                price,
                sl_price,
                tp_price,
                profit,
                swap,
                commission,
                magic,
                comment,
                resolved_open,
                resolved_deal,
                int(data.get("server_gmt_offset") or 0),
                raw,
                data.get("server_open_time"),
                data.get("server_deal_time"),
                timezone_profile_id,
            ),
        )
        return

    if event_type == "instrument":
        symbol = str(_require(data, "symbol", event_type))
        digits = int(_require(data, "digits", event_type))
        point = float(_require(data, "point", event_type))
        tick_value = float(_require(data, "tick_value", event_type))
        contract_size = float(_require(data, "contract_size", event_type))
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        db.execute(
            """
            INSERT INTO symbols (
                account_login, symbol, digits, point, contract_size,
                tick_value, tick_size, currency_base, currency_profit, raw_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, '', '', %s)
            ON CONFLICT (account_login, symbol) DO UPDATE SET
                digits=excluded.digits,
                point=excluded.point,
                contract_size=excluded.contract_size,
                tick_value=excluded.tick_value,
                tick_size=excluded.tick_size,
                raw_json=excluded.raw_json,
                updated_at=now_iso()
            """,
            (login, symbol, digits, point, contract_size, tick_value, point, raw),
        )
        return

    if event_type == "account_snapshot":
        timestamp = int(_require(data, "occurred_at", event_type))
        balance = float(_require(data, "balance", event_type))
        equity = float(_require(data, "equity", event_type))
        margin = float(data.get("margin") or 0)
        free_margin = float(data.get("free_margin") or 0)
        margin_level = (equity / margin * 100.0) if margin > 0 else None
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        db.execute(
            """
            INSERT INTO snapshots (
                account_login, timestamp, balance, equity, margin,
                free_margin, margin_level, raw_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (account_login, timestamp) DO NOTHING
            """,
            (login, timestamp, balance, equity, margin, free_margin, margin_level, raw),
        )
        return

    if event_type == "heartbeat":
        broker_server = str(data.get("broker_server") or "").strip()[:120] or None
        broker_company = str(data.get("broker_company") or "").strip()[:120] or None
        server_gmt_offset = data.get("server_gmt_offset")
        timezone_name = str(data.get("server_timezone_name") or "").strip()[:32] or None
        observe_timezone_candidate(
            db,
            platform=str(account.get("platform") or "mt5"),
            broker_server=broker_server or account.get("broker_server"),
            broker_company=broker_company or account.get("broker_company"),
            observed_offset_seconds=int(server_gmt_offset) if server_gmt_offset is not None else None,
        )
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        db.execute(
            """
            INSERT INTO heartbeats (
                account_login, server_gmt_off, account_currency, broker_company,
                broker_server, ea_version, payload, last_seen_at,
                server_gmt_offset, server_timezone_name
            ) VALUES (%s, 0, '', %s, %s, '', %s, now_iso(), %s, %s)
            ON CONFLICT (account_login) DO UPDATE SET
                broker_company=COALESCE(excluded.broker_company, heartbeats.broker_company),
                broker_server=COALESCE(excluded.broker_server, heartbeats.broker_server),
                server_gmt_offset=COALESCE(excluded.server_gmt_offset, heartbeats.server_gmt_offset),
                server_timezone_name=COALESCE(NULLIF(TRIM(excluded.server_timezone_name), ''), heartbeats.server_timezone_name),
                payload=excluded.payload,
                last_seen_at=now_iso()
            """,
            (login, broker_company, broker_server, raw, server_gmt_offset, timezone_name),
        )
        db.execute(
            """
            UPDATE accounts
               SET last_seen_at=now_iso(),
                   broker_server=COALESCE(NULLIF(TRIM(%s), ''), broker_server),
                   broker_company=COALESCE(NULLIF(TRIM(%s), ''), broker_company),
                   server_gmt_off=COALESCE(%s, server_gmt_off),
                   server_timezone_name=COALESCE(NULLIF(TRIM(%s), ''), server_timezone_name)
             WHERE id = %s
            """,
            (broker_server, broker_company, server_gmt_offset, timezone_name, account["id"]),
        )
        return
