from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone

from fastapi import HTTPException
import openpyxl

from app.db import DBConnection, DBRow

from . import repository
from ..trade_center.cache import invalidate_user


_HEADER_ALIASES = {
    "ticket": ("ticket", "deal", "deal_ticket", "ticket #", "成交", "单号"),
    "position_id": ("position_id", "position", "position id", "pos id", "持仓", "仓位"),
    "order_id": ("order", "order_id", "order #", "order_ticket", "订单", "订单号"),
    "symbol": ("symbol", "交易品种", "品种"),
    "entry": ("entry", "entry_type", "direction", "趋势", "方向"),
    "type": ("type", "deal_type", "类型"),
    "volume": ("volume", "交易量", "手数"),
    "price": ("price", "open price", "价位", "价格"),
    "sl_price": ("sl", "s/l", "sl_price", "stop loss", "止损"),
    "tp_price": ("tp", "t/p", "tp_price", "take profit", "止盈"),
    "profit": ("profit", "盈利", "盈亏"),
    "swap": ("swap", "库存费", "隔夜利息", "掉期"),
    "commission": ("commission", "手续费", "佣金"),
    "magic": ("magic", "magic number", "魔术号"),
    "comment": ("comment", "注释", "备注"),
    "time": ("time", "open time", "open_time", "deal_time", "时间", "成交时间", "开仓时间"),
}


def _normalize_header(value: str) -> str:
    return re.sub(r"[^\w]+", "", value.strip().lower(), flags=re.UNICODE)


def _build_header_map(headers: list[str]) -> dict[str, int]:
    normalized = {index: _normalize_header(name) for index, name in enumerate(headers)}
    mapping: dict[str, int] = {}
    for field, aliases in _HEADER_ALIASES.items():
        normalized_aliases = {_normalize_header(alias) for alias in aliases}
        for index, name in normalized.items():
            if name in normalized_aliases:
                mapping[field] = index
                break
    return mapping


def _parse_time(value: str) -> int:
    text = value.strip()
    if not text:
        raise ValueError("成交时间为空")
    text = re.sub(r"(\d{4})\.(\d{2})\.(\d{2})", r"\1-\2-\3", text)
    try:
        dt = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"无法解析成交时间: {value}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _parse_int(value: str, field: str, default: int = 0) -> int:
    text = value.strip()
    if not text:
        return default
    try:
        return int(float(text))
    except ValueError as exc:
        raise ValueError(f"{field} 必须是整数") from exc


def _parse_float(value: str, field: str, default: float = 0.0) -> float:
    text = value.strip()
    if not text:
        return default
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError(f"{field} 必须是数字") from exc


_ENTRY_MAP = {"in": 0, "out": 1, "inout": 2, "in/out": 2, "out by": 3, "outby": 3, "0": 0, "1": 1, "2": 2, "3": 3}
_TYPE_MAP = {"buy": 0, "sell": 1, "0": 0, "1": 1}
_NON_TRADE_TYPES = {"balance", "credit", "debit", "charge", "correction", "bonus", "withdrawal", "commission"}
_DEALS_SECTION_TITLES = {"成交", "deals"}
_SECTION_MARKERS = {
    "成交", "deals", "持仓", "positions", "订单", "orders", "结果", "results",
    "结余", "balance", "净值", "equity", "结余亏损",
}
_XLSX_MAGIC = b"PK\x03\x04"


def _is_xlsx(file_name: str, content: bytes) -> bool:
    if file_name.lower().endswith(".xlsx"):
        return True
    return content[:4] == _XLSX_MAGIC


def _rows_to_strings(rows) -> list[list[str]]:
    return [["" if cell is None else str(cell) for cell in row] for row in rows]


def _extract_deals_table(rows: list[list[str]]) -> list[list[str]] | None:
    """Locate the MT5 '成交'/'Deals' section and return its header + data rows."""
    header_index: int | None = None
    for index, row in enumerate(rows):
        first = (row[0] or "").strip() if row else ""
        if first and _normalize_header(first) in _DEALS_SECTION_TITLES:
            header_index = index + 1
            break
    if header_index is None or header_index >= len(rows):
        return None

    header = rows[header_index]
    data: list[list[str]] = []
    for row in rows[header_index + 1:]:
        if not any(cell.strip() for cell in row):
            continue
        first = (row[0] or "").strip() if row else ""
        if not first:
            # The total/summary row has an empty time but numeric totals.
            break
        if _normalize_header(first) in _SECTION_MARKERS:
            break
        data.append(row)
    return [header] + data


def _parse_rows(rows: list[list[str]]) -> tuple[list[dict], list[dict]]:
    """Return (deals, errors) from a table whose first row is the header."""
    if not rows:
        return [], [{"row_number": 0, "reason": "文件为空", "raw_summary": ""}]

    header_map = _build_header_map(rows[0])
    required = {"ticket", "symbol", "volume", "price", "time"}
    missing = sorted(required - set(header_map))
    if missing:
        return [], [{"row_number": 0, "reason": f"缺少必要列: {', '.join(missing)}", "raw_summary": ", ".join(rows[0])}]

    deals: list[dict] = []
    errors: list[dict] = []
    for line_number, row in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in row):
            continue

        def cell(field: str) -> str:
            index = header_map.get(field)
            return row[index].strip() if index is not None and index < len(row) else ""

        type_raw = cell("type").lower()
        if type_raw in _NON_TRADE_TYPES:
            # Balance / credit / charge / bonus rows are account operations, not
            # trades, so skip them without counting as imported or as errors.
            continue

        try:
            ticket = _parse_int(cell("ticket"), "Ticket", 0)
            if ticket <= 0:
                raise ValueError("Ticket 必须大于 0")
            entry_raw = cell("entry").lower()
            entry = _ENTRY_MAP.get(entry_raw)
            if entry is None:
                entry = _parse_int(entry_raw or "0", "Direction")
            deal_type = _TYPE_MAP.get(type_raw)
            if deal_type is None:
                deal_type = _parse_int(type_raw or "0", "Type")
            timestamp = _parse_time(cell("time"))
            deal = {
                "row_number": line_number,
                "ticket": ticket,
                "position_id": _parse_int(cell("position_id"), "Position ID"),
                "order_id": _parse_int(cell("order_id"), "Order"),
                "symbol": cell("symbol") or "",
                "entry": entry,
                "type": deal_type,
                "volume": _parse_float(cell("volume"), "Volume"),
                "price": _parse_float(cell("price"), "Price"),
                "sl_price": _parse_float(cell("sl_price"), "S/L"),
                "tp_price": _parse_float(cell("tp_price"), "T/P"),
                "profit": _parse_float(cell("profit"), "Profit"),
                "swap": _parse_float(cell("swap"), "Swap"),
                "commission": _parse_float(cell("commission"), "Commission"),
                "magic": _parse_int(cell("magic"), "Magic"),
                "comment": cell("comment"),
                "deal_time": timestamp,
            }
            if not deal["symbol"]:
                raise ValueError("Symbol 不能为空")
            if deal["volume"] <= 0 or deal["price"] <= 0:
                raise ValueError("Volume 和 Price 必须大于 0")
            deals.append(deal)
        except ValueError as exc:
            errors.append({"row_number": line_number, "reason": str(exc), "raw_summary": ",".join(row[:8])[:300]})
    return deals, errors


def parse_csv_content(content: bytes) -> tuple[list[dict], list[dict]]:
    """Return (deals, errors) for a CSV file. Each deal includes ``row_number``."""
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    return _parse_rows(list(reader))


def parse_xlsx_content(content: bytes) -> tuple[list[dict], list[dict]]:
    """Return (deals, errors) for an XLSX file. Each deal includes ``row_number``."""
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        return [], [{"row_number": 0, "reason": f"无法读取 XLSX 文件: {exc}", "raw_summary": ""}]
    sheet = workbook.active
    rows = _rows_to_strings(sheet.iter_rows(values_only=True))
    workbook.close()
    table = _extract_deals_table(rows) or rows
    return _parse_rows(table)


def import_deals(db: DBConnection, user: DBRow, account: DBRow, file_name: str, content: bytes) -> dict:
    if _is_xlsx(file_name, content):
        deals, errors = parse_xlsx_content(content)
        file_kind = "xlsx"
    else:
        deals, errors = parse_csv_content(content)
        file_kind = "csv"
    db.execute("BEGIN")
    try:
        cursor = db.execute(
            """
            INSERT INTO account_import_batches
                (user_id, account_id, file_name, file_sha256, status, total_rows, imported_rows,
                 duplicate_rows, error_rows, started_at, finished_at)
            VALUES (%s, %s, %s, %s, 'completed', %s, 0, 0, %s, now_iso(), now_iso())
            RETURNING id
            """,
            (user["id"], account["id"], file_name, hashlib.sha256(content).hexdigest(), len(deals) + len(errors), len(errors)),
        )
        batch_id = cursor.lastrowid

        imported = 0
        duplicate = 0
        for deal in deals:
            existing = db.execute(
                "SELECT id FROM deals WHERE account_login=%s AND ticket=%s",
                (account["mt5_login"], deal["ticket"]),
            ).fetchone()
            if existing is not None:
                duplicate += 1
                continue
            raw = json.dumps({key: value for key, value in deal.items() if key != "row_number"}, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            db.execute(
                """
                INSERT INTO deals (
                    account_login, ticket, position_id, order_id, symbol, entry, type, volume,
                    price, sl_price, tp_price, profit, swap, commission, magic, comment,
                    open_time, deal_time, server_gmt_off, raw_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s)
                ON CONFLICT (account_login, ticket) DO NOTHING
                """,
                (
                    account["mt5_login"], deal["ticket"], deal["position_id"], deal["order_id"], deal["symbol"],
                    deal["entry"], deal["type"], deal["volume"], deal["price"], deal["sl_price"], deal["tp_price"],
                    deal["profit"], deal["swap"], deal["commission"], deal["magic"], deal["comment"],
                    deal["deal_time"], deal["deal_time"], raw,
                ),
            )
            imported += 1

        for error in errors:
            db.execute(
                "INSERT INTO account_import_errors (batch_id, row_number, reason, raw_summary) VALUES (%s, %s, %s, %s)",
                (batch_id, error["row_number"], error["reason"], error["raw_summary"]),
            )

        db.execute(
            "UPDATE account_import_batches SET imported_rows=%s, duplicate_rows=%s WHERE id=%s",
            (imported, duplicate, batch_id),
        )
        db.commit()
        invalidate_user(int(user["id"]))
    except Exception:
        db.rollback()
        raise
    return {
        "batch_id": batch_id,
        "file_name": file_name,
        "file_kind": file_kind,
        "total_rows": len(deals) + len(errors),
        "imported_rows": imported,
        "duplicate_rows": duplicate,
        "error_rows": len(errors),
        "errors": errors[:100],
    }


def get_import(db: DBConnection, user: DBRow, account_id: int, batch_id: int) -> dict:
    batch = db.execute(
        "SELECT * FROM account_import_batches WHERE id=%s AND account_id=%s AND user_id=%s",
        (batch_id, account_id, user["id"]),
    ).fetchone()
    if batch is None:
        raise HTTPException(404, "导入批次不存在")
    errors = db.execute(
        "SELECT row_number, reason, raw_summary FROM account_import_errors WHERE batch_id=%s ORDER BY id LIMIT 100",
        (batch_id,),
    ).fetchall()
    result = dict(batch)
    result["errors"] = [dict(row) for row in errors]
    return result
