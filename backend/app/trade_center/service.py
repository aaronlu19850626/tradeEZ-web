from __future__ import annotations

from fastapi import HTTPException, status

from app.db import DBConnection, DBRow

from . import repository
from .schemas import (
    CalendarDayOut,
    GroupOut,
    SeriesPoint,
    StatsOut,
    SummaryOut,
    TradeFilter,
    TradeItem,
    beijing_day,
    beijing_week_start,
    day_bounds,
)

SORT_FIELDS = {
    "closeTime",
    "openTime",
    "symbol",
    "side",
    "volume",
    "net",
    "points",
    "rr",
    "swap",
    "commission",
    "duration",
    "accountName",
}


def _round(value: float, digits: int = 2) -> float:
    return round(float(value) + 0.0, digits)


def _to_item(row: DBRow) -> TradeItem:
    side = "buy" if int(row["type"]) == 0 else "sell"
    volume = float(row["volume"] or 0)
    close_price = float(row["close_price"] or 0)
    open_price = float(row["open_price"]) if row["open_price"] is not None else None
    sl_price = float(row["sl_price"]) if (row["sl_price"] or 0) > 0 else None
    tp_price = float(row["tp_price"]) if (row["tp_price"] or 0) > 0 else None
    profit = float(row["profit"] or 0)
    swap = float(row["swap"] or 0)
    commission = float(row["commission"] or 0)
    point = float(row["point"]) if row["point"] else None
    contract_size = float(row["contract_size"]) if row["contract_size"] else None
    gross_pnl = _round(profit + swap)
    net_pnl = _round(profit + swap + commission)

    points: float | None = None
    if open_price is not None and point:
        signed = (close_price - open_price) if side == "buy" else (open_price - close_price)
        points = _round(signed / point, 1)

    r_multiple: float | None = None
    roi_pct: float | None = None
    if open_price is not None and sl_price is not None and contract_size:
        initial_risk = abs(open_price - sl_price) * contract_size * volume
        if initial_risk > 0:
            r_multiple = _round(net_pnl / initial_risk, 4)
    if open_price is not None and contract_size:
        notional = open_price * contract_size * volume
        if notional > 0:
            roi_pct = _round(net_pnl / notional * 100, 3)

    comment = (row["comment"] or "").strip()
    account_login = str(row["account_login"])
    return TradeItem(
        id=f"{account_login}-{row['ticket']}",
        accountId=int(row["account_id"]),
        accountName=row["account_name"],
        accountLogin=account_login,
        currency=row["currency"],
        symbol=str(row["symbol"] or ""),
        side=side,
        volume=volume,
        openPrice=open_price,
        closePrice=close_price,
        slPrice=sl_price,
        tpPrice=tp_price,
        openTime=int(row["open_time"] or 0),
        closeTime=int(row["deal_time"] or 0),
        profit=profit,
        swap=swap,
        commission=commission,
        grossPnl=gross_pnl,
        netPnl=net_pnl,
        roiPct=roi_pct,
        rMultiple=r_multiple,
        points=points,
        durationSec=max(0, int(row["deal_time"] or 0) - int(row["open_time"] or 0)),
        strategy=comment or None,
        magic=int(row["magic"] or 0),
    )


def _apply_filters(items: list[TradeItem], flt: TradeFilter) -> list[TradeItem]:
    if flt.side != "all":
        items = [item for item in items if item.side == flt.side]
    if flt.result != "all":
        if flt.result == "win":
            items = [item for item in items if item.netPnl > 0]
        elif flt.result == "loss":
            items = [item for item in items if item.netPnl < 0]
        else:
            items = [item for item in items if item.netPnl == 0]
    if flt.symbol:
        items = [item for item in items if item.symbol == flt.symbol]
    return items


def compute_stats(items: list[TradeItem]) -> StatsOut:
    gross = net = commission = swap = volume = 0.0
    winners = losers = breakeven = 0
    win_sum = loss_sum = 0.0
    r_count = 0
    r_sum = 0.0
    for item in items:
        gross += item.grossPnl
        net += item.netPnl
        commission += item.commission
        swap += item.swap
        volume += item.volume
        if item.netPnl > 0:
            winners += 1
            win_sum += item.netPnl
        elif item.netPnl < 0:
            losers += 1
            loss_sum += -item.netPnl
        else:
            breakeven += 1
        if item.rMultiple is not None:
            r_count += 1
            r_sum += item.rMultiple

    ordered = sorted(items, key=lambda item: (item.closeTime, item.id))
    running = 0.0
    peak = 0.0
    trough = 0.0
    for item in ordered:
        running = _round(running + item.netPnl)
        peak = max(peak, running)
        trough = min(trough, running)

    count = len(items)
    return StatsOut(
        count=count,
        gross=_round(gross),
        net=_round(net),
        commission=_round(commission),
        swap=_round(swap),
        winners=winners,
        losers=losers,
        breakeven=breakeven,
        winRate=winners / count if count else 0.0,
        volume=_round(volume),
        profitFactor=_round(win_sum / loss_sum) if loss_sum > 0 else None,
        avgWin=_round(win_sum / winners) if winners > 0 else None,
        avgLoss=_round(loss_sum / losers) if losers > 0 else None,
        winSum=_round(win_sum),
        lossSum=_round(loss_sum),
        avgR=_round(r_sum / r_count) if r_count > 0 else None,
        netPeak=_round(peak),
        netTrough=_round(trough),
    )


def cumulative_series(items: list[TradeItem]) -> list[SeriesPoint]:
    ordered = sorted(items, key=lambda item: (item.closeTime, item.id))
    running = 0.0
    points = [SeriesPoint(index=0, value=0.0)]
    for index, item in enumerate(ordered, start=1):
        running = _round(running + item.netPnl)
        points.append(SeriesPoint(index=index, value=running))
    return points


def _resolve_logins(db: DBConnection, user: DBRow, account_ids: list[int] | None) -> list[int]:
    accounts = repository.list_owned_accounts(db, int(user["id"]))
    owned = {int(row["id"]): row for row in accounts}
    if account_ids is None:
        selected = [row for row in accounts if bool(row["is_statistics"])]
    else:
        selected = []
        for account_id in account_ids:
            row = owned.get(account_id)
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="交易账户不存在")
            selected.append(row)
    return [int(row["mt5_login"]) for row in selected]


def _load_items(db: DBConnection, user: DBRow, flt: TradeFilter) -> list[TradeItem]:
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        return []
    from_epoch, to_epoch = day_bounds(flt.from_day, flt.to_day)
    rows = repository.fetch_closed_trades(
        db,
        user_id=int(user["id"]),
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
    )
    items = [_to_item(row) for row in rows]
    return _apply_filters(items, flt)


def _sort(items: list[TradeItem], sort: str, order: str) -> list[TradeItem]:
    field = "closeTime" if sort not in SORT_FIELDS else sort
    attr_map = {"net": "netPnl", "rr": "rMultiple", "duration": "durationSec"}
    attr = attr_map.get(field, field)
    nulls = [item for item in items if getattr(item, attr) is None]
    non_null = [item for item in items if getattr(item, attr) is not None]
    non_null.sort(key=lambda item: (getattr(item, attr), item.id), reverse=(order == "desc"))
    return non_null + nulls


def list_trades(db: DBConnection, user: DBRow, flt: TradeFilter, sort: str, order: str, page: int, page_size: int) -> tuple[list[TradeItem], int]:
    items = _load_items(db, user, flt)
    items = _sort(items, sort, order)
    total = len(items)
    start = (page - 1) * page_size
    return items[start : start + page_size], total


def summary(db: DBConnection, user: DBRow, flt: TradeFilter) -> SummaryOut:
    items = _load_items(db, user, flt)
    return SummaryOut(stats=compute_stats(items), series=cumulative_series(items))


def groups(db: DBConnection, user: DBRow, flt: TradeFilter, view: str) -> list[GroupOut]:
    items = _load_items(db, user, flt)
    key_of = beijing_day if view == "day" else beijing_week_start
    buckets: dict[str, list[TradeItem]] = {}
    for item in items:
        buckets.setdefault(key_of(item.closeTime), []).append(item)

    result: list[GroupOut] = []
    for key in sorted(buckets, reverse=True):
        trades = sorted(buckets[key], key=lambda item: (item.closeTime, item.id), reverse=True)
        days = [beijing_day(item.closeTime) for item in trades]
        result.append(
            GroupOut(
                key=key,
                startDay=min(days),
                endDay=max(days),
                stats=compute_stats(trades),
                series=cumulative_series(trades),
                trades=trades,
            ),
        )
    return result


def calendar(db: DBConnection, user: DBRow, flt: TradeFilter, month: str) -> list[CalendarDayOut]:
    items = _load_items(db, user, flt)
    buckets: dict[str, dict] = {}
    for item in items:
        day = beijing_day(item.closeTime)
        if not day.startswith(month):
            continue
        bucket = buckets.setdefault(day, {"net": 0.0, "count": 0})
        bucket["net"] = _round(bucket["net"] + item.netPnl)
        bucket["count"] += 1
    return [CalendarDayOut(day=day, net=value["net"], count=value["count"]) for day, value in sorted(buckets.items())]


def symbols(db: DBConnection, user: DBRow) -> list[str]:
    return repository.distinct_symbols(db, int(user["id"]))
