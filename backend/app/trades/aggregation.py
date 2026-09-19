from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Iterable
from typing import Any

from ..schemas import PositionOut


def build_positions(account_login: int, rows: Iterable[Mapping[str, Any]], include_closed: bool = True) -> list[PositionOut]:
    grouped: dict[int, list[Mapping[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["position_id"]:
            grouped[row["position_id"]].append(row)

    positions: list[PositionOut] = []
    for position_id, deals in grouped.items():
        deals.sort(key=lambda d: (int(d["deal_time"]), int(d["ticket"]) if "ticket" in d.keys() else 0))
        volume_in = volume_out = open_value = close_value = net_pnl = 0.0
        inventory = 0.0
        issues: set[str] = set()
        swap_total = commission_total = 0.0
        open_time = close_time = None
        sl_price = tp_price = None
        magic = None
        comment = None
        direction = None

        for deal in deals:
            volume = float(deal["volume"])
            price = float(deal["price"])
            entry = int(deal["entry"])
            swap_total += float(deal["swap"])
            commission_total += float(deal["commission"])
            net_pnl += float(deal["profit"]) + float(deal["swap"]) + float(deal["commission"])
            if int(deal["type"]) not in (0, 1):
                # Preserve non-trade facts and their reported fees without inventing BUY/SELL legs.
                issues.add("non_trade_deal")
                continue
            sign = 1 if int(deal["type"]) == 0 else -1
            opening = closing = 0.0
            if entry == 0:
                opening = volume
                if inventory * sign < -1e-9:
                    issues.add("opening_direction_conflict")
                inventory += sign * volume
            elif entry in (1, 3):
                closing = volume
                if abs(inventory) < 1e-9:
                    issues.add("missing_opening")
                elif inventory * sign >= 0:
                    issues.add("closing_direction_conflict")
                if volume > abs(inventory) + 1e-9:
                    issues.add("volume_mismatch")
                inventory += sign * volume
            elif entry == 2:
                issues.add("reversal_requires_lifecycle_split")
                if abs(inventory) < 1e-9 or inventory * sign >= 0:
                    issues.add("missing_reversal_opening")
                    opening = volume
                else:
                    closing = min(abs(inventory), volume)
                    opening = max(0.0, volume - closing)
                inventory += sign * volume
                direction = "mixed"
            if opening:
                if open_time is None:
                    # Client open_time may be the fallback close time. Prefer actual IN facts.
                    open_time = int(deal["deal_time"])
                    sl_price = deal["sl_price"]
                    tp_price = deal["tp_price"]
                    magic = int(deal["magic"])
                    comment = deal["comment"]
                    direction = direction or ("buy" if sign == 1 else "sell")
                open_value += price * opening
                volume_in += opening
            if closing:
                close_value += price * closing
                volume_out += closing
                close_time = int(deal["deal_time"])

        # A close-only record can arrive during limited history sync, but it is not
        # a valid paired order until its opening-side deal has been synchronized.
        if volume_in <= 0:
            issues.add("missing_opening")
        open_price = open_value / volume_in if volume_in else None
        close_price = close_value / volume_out if volume_out else None
        is_closed = not issues and volume_in > 0 and abs(inventory) < 1e-9
        hold_seconds = close_time - open_time if is_closed and open_time is not None and close_time is not None else None
        positions.append(
            PositionOut(
                account_login=account_login,
                reconciliation_status="needs_review" if issues else ("complete" if is_closed else "partial"),
                reconciliation_issues=sorted(issues),
                remaining_volume=round(abs(inventory), 8),
                position_id=position_id,
                symbol=deals[0]["symbol"],
                strategy=classify_strategy(magic, comment),
                direction=direction or "unknown",
                volume_in=round(volume_in, 8),
                volume_out=round(volume_out, 8),
                open_price=round(open_price, 8) if open_price is not None else None,
                close_price=round(close_price, 8) if close_price is not None else None,
                sl_price=sl_price,
                tp_price=tp_price,
                swap_total=round(swap_total, 8),
                commission_total=round(commission_total, 8),
                net_pnl=round(net_pnl, 8),
                open_time=open_time,
                close_time=close_time if is_closed else None,
                hold_seconds=hold_seconds,
                is_closed=is_closed,
                magic=magic,
                comment=comment,
            )
        )

    positions.sort(key=lambda item: (item.open_time or 0, item.position_id), reverse=True)
    if not include_closed:
        positions = [item for item in positions if not item.is_closed]
    return positions


def classify_strategy(magic: int | None, comment: str | None) -> str:
    text = (comment or "").upper()
    if magic == 920717 or "TRADEEZ-SC" in text or "GOLDSOP-SC" in text:
        return "scalp"
    if magic == 920718 or "TRADEEZ-TR" in text or "GOLDSOP-TR" in text:
        return "trend"
    if magic:
        return "other"
    return "manual"
