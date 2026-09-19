"""Deterministic lifecycle projection; never mutates the source deal facts."""
from dataclasses import dataclass
from decimal import Decimal

from .aggregation import build_positions
from ..schemas import PositionOut


@dataclass
class Lifecycle:
    anchor_ticket: int
    summary: PositionOut
    allocations: list[dict]


def build_lifecycles(login: int, rows) -> list[Lifecycle]:
    ordered = sorted((dict(row) for row in rows), key=lambda r: (r["deal_time"], r["ticket"]))
    for row in ordered:
        row["symbol"] = row["symbol"] or ""
    result = []
    block = []
    allocations = []
    inventory = Decimal(0)

    def append(row, role, method="reported"):
        block.append(row)
        allocations.append({"deal_ticket": row["ticket"], "role": role,
                            "volume": row["volume"], "profit": row["profit"],
                            "swap": row["swap"], "commission": row["commission"], "method": method})

    def finish():
        if not block:
            return
        summaries = build_positions(login, block)
        if summaries:
            symbols = {row["symbol"] for row in block}
            if "" in symbols or len(symbols) > 1:
                summaries[0].reconciliation_issues.append("inconsistent_symbol")
                summaries[0].reconciliation_status = "needs_review"
                summaries[0].is_closed = False
                summaries[0].close_time = None
                summaries[0].hold_seconds = None
            result.append(Lifecycle(block[0]["ticket"], summaries[0], list(allocations)))
        block.clear()
        allocations.clear()

    for row in ordered:
        volume = Decimal(str(row["volume"]))
        sign = Decimal(1 if row["type"] == 0 else -1)
        trade = row["type"] in (0, 1)
        # A new IN after flat starts a distinct lifecycle even if the broker reuses position_id.
        if trade and row["entry"] == 0 and inventory == 0 and block:
            finish()
        valid_history = (bool(block) and build_positions(login, block)[0].reconciliation_status != "needs_review"
                         and all(item["symbol"] == row["symbol"] and item["symbol"] for item in block)) if row["entry"] == 2 else True
        if trade and row["entry"] == 2 and inventory * sign < 0 and volume >= abs(inventory) and valid_history:
            closing = abs(inventory)
            opening = volume - closing
            fee = Decimal(str(row["commission"]))
            closing_fee = fee * closing / volume
            append({**row, "entry": 1, "volume": float(closing), "commission": float(closing_fee)},
                   "close", "reversal_volume_proportion")
            finish()
            inventory = sign * opening
            if opening:
                append({**row, "entry": 0, "volume": float(opening), "profit": 0.0, "swap": 0.0,
                        "commission": float(fee - closing_fee)}, "open", "reversal_volume_proportion")
            continue
        role = "open" if trade and row["entry"] == 0 else "close" if trade and row["entry"] in (1, 3) else "unresolved"
        append(row, role)
        if trade:
            inventory += sign * volume
    finish()
    return result
