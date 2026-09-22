from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from fastapi import HTTPException, status

from app.db import DBConnection, DBRow

from . import repository
from .cache import (
    get_cached_items,
    get_cached_object,
    get_or_set_object,
    put_cached_items,
    put_cached_object,
)
from .schemas import (
    CalendarDayOut,
    ConsistencyCellOut,
    ConsistencyOut,
    DayStatOut,
    GroupOut,
    OverviewOut,
    OverviewRecentOut,
    OverviewStatsOut,
    PLATFORM_TZ,
    ScatterPointOut,
    SeriesPoint,
    BoundsOut,
    StatsOut,
    SummaryOut,
    SymbolAccountOut,
    SymbolOptionOut,
    TradeFilter,
    TradeItem,
    beijing_day,
    beijing_week_start,
    day_bounds,
)
from .score import composite_score, composite_score_from_metrics

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


@dataclass(slots=True)
class LightTrade:
    id: str
    accountId: int
    symbol: str
    side: str
    currency: str | None
    marketProfile: str
    openTime: int
    closeTime: int
    grossPnl: float
    netPnl: float
    commission: float
    swap: float
    volume: float
    rMultiple: float | None
    durationSec: int


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
        marketProfile=str(row["market_profile"] or "fx"),
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


def _to_light_item(row: DBRow) -> LightTrade:
    side = "buy" if int(row["type"]) == 0 else "sell"
    volume = float(row["volume"] or 0)
    close_price = float(row["close_price"] or 0)
    open_price = float(row["open_price"]) if row["open_price"] is not None else None
    sl_price = float(row["sl_price"]) if (row["sl_price"] or 0) > 0 else None
    profit = float(row["profit"] or 0)
    swap = float(row["swap"] or 0)
    commission = float(row["commission"] or 0)
    contract_size = float(row["contract_size"]) if row["contract_size"] else None
    gross_pnl = _round(profit + swap)
    net_pnl = _round(profit + swap + commission)
    r_multiple: float | None = None
    if open_price is not None and sl_price is not None and contract_size:
        initial_risk = abs(open_price - sl_price) * contract_size * volume
        if initial_risk > 0:
            r_multiple = _round(net_pnl / initial_risk, 4)
    account_login = str(row["account_login"])
    return LightTrade(
        id=f"{account_login}-{row['ticket']}",
        accountId=int(row["account_id"]),
        symbol=str(row["symbol"] or ""),
        side=side,
        currency=row["currency"],
        marketProfile=str(row["market_profile"] or "fx"),
        openTime=int(row["open_time"] or 0),
        closeTime=int(row["deal_time"] or 0),
        grossPnl=gross_pnl,
        netPnl=net_pnl,
        commission=commission,
        swap=swap,
        volume=volume,
        rMultiple=r_multiple,
        durationSec=max(0, int(row["deal_time"] or 0) - int(row["open_time"] or 0)),
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
    if flt.currency:
        items = [item for item in items if item.currency == flt.currency]
    if flt.market_profile:
        items = [item for item in items if item.marketProfile == flt.market_profile]
    symbols = flt.symbol_list()
    if symbols:
        items = [item for item in items if item.symbol in symbols]
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


def _stats_from_sql(row: dict) -> StatsOut:
    count = int(row.get("count") or 0)
    winners = int(row.get("winners") or 0)
    losers = int(row.get("losers") or 0)
    win_sum = float(row.get("win_sum") or 0)
    loss_sum = float(row.get("loss_sum") or 0)
    return StatsOut(
        count=count,
        gross=_round(float(row.get("gross") or 0)),
        net=_round(float(row.get("net") or 0)),
        commission=_round(float(row.get("commission") or 0)),
        swap=_round(float(row.get("swap") or 0)),
        winners=winners,
        losers=losers,
        breakeven=int(row.get("breakeven") or 0),
        winRate=(winners / count) if count else 0.0,
        volume=_round(float(row.get("volume") or 0)),
        profitFactor=_round(win_sum / loss_sum) if loss_sum > 0 else None,
        avgWin=_round(win_sum / winners) if winners > 0 else None,
        avgLoss=_round(loss_sum / losers) if losers > 0 else None,
        winSum=_round(win_sum),
        lossSum=_round(loss_sum),
        avgR=_round(float(row["avg_r"])) if row.get("avg_r") is not None else None,
        netPeak=_round(float(row.get("net_peak") or 0)),
        netTrough=_round(float(row.get("net_trough") or 0)),
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


def _load_items(db: DBConnection, user: DBRow, flt: TradeFilter, *, light: bool = False) -> list:
    variant = "light" if light else "full"
    cached = get_cached_items(int(user["id"]), flt, variant)
    if cached is not None:
        return cached
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
    converter = _to_light_item if light else _to_item
    items = [converter(row) for row in rows]
    items = _apply_filters(items, flt)
    put_cached_items(int(user["id"]), flt, items, variant)
    return items


def _sort(items: list[TradeItem], sort: str, order: str) -> list[TradeItem]:
    field = "closeTime" if sort not in SORT_FIELDS else sort
    attr_map = {"net": "netPnl", "rr": "rMultiple", "duration": "durationSec"}
    attr = attr_map.get(field, field)
    nulls = [item for item in items if getattr(item, attr) is None]
    non_null = [item for item in items if getattr(item, attr) is not None]
    non_null.sort(key=lambda item: (getattr(item, attr), item.id), reverse=(order == "desc"))
    return non_null + nulls


def list_trades(db: DBConnection, user: DBRow, flt: TradeFilter, sort: str, order: str, page: int, page_size: int) -> tuple[list[TradeItem], int]:
    if sort in {"closeTime", "openTime", "symbol", "side", "volume", "swap", "commission", "duration", "accountName"}:
        logins = _resolve_logins(db, user, flt.account_id_list())
        if not logins:
            return [], 0
        from_epoch, to_epoch = day_bounds(flt.from_day, flt.to_day)
        rows, total = repository.fetch_closed_trades_page(
            db,
            user_id=int(user["id"]),
            logins=logins,
            from_epoch=from_epoch,
            to_epoch=to_epoch,
            side=flt.side,
            result=flt.result,
            currency=flt.currency,
            market_profile=flt.market_profile,
            symbol=flt.symbol,
            sort=sort,
            order=order,
            page=page,
            page_size=page_size,
        )
        return [_to_item(row) for row in rows], total
    items = _load_items(db, user, flt)
    items = _sort(items, sort, order)
    total = len(items)
    start = (page - 1) * page_size
    return items[start : start + page_size], total


def summary(db: DBConnection, user: DBRow, flt: TradeFilter) -> SummaryOut:
    user_id = int(user["id"])
    cached = get_cached_object(user_id, flt, "summary")
    if isinstance(cached, SummaryOut):
        return cached
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        result = SummaryOut(stats=compute_stats([]), series=[SeriesPoint(index=0, value=0.0)])
        put_cached_object(user_id, flt, result, "summary")
        return result
    from_epoch, to_epoch = day_bounds(flt.from_day, flt.to_day)
    row, series_rows = repository.fetch_trade_summary_sql(
        db,
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=flt.side,
        result=flt.result,
        currency=flt.currency,
        market_profile=flt.market_profile,
        symbol=flt.symbol,
    )
    series = [SeriesPoint(index=0, value=0.0)]
    series.extend(
        SeriesPoint(index=int(item["index"]), value=_round(float(item["value"] or 0)))
        for item in series_rows
    )
    result = SummaryOut(stats=_stats_from_sql(row), series=series)
    put_cached_object(user_id, flt, result, "summary")
    return result


def groups(
    db: DBConnection,
    user: DBRow,
    flt: TradeFilter,
    view: str,
    *,
    limit: int | None = None,
    offset: int = 0,
    include_trades: bool = True,
) -> list[GroupOut]:
    user_id = int(user["id"])
    cache_variant = f"groups:{view}:{limit}:{offset}:{include_trades}"
    cached = get_cached_object(user_id, flt, cache_variant)
    if isinstance(cached, list):
        return cached
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        put_cached_object(user_id, flt, [], cache_variant)
        return []
    from_epoch, to_epoch = day_bounds(flt.from_day, flt.to_day)
    key_limit = (limit + 1) if limit is not None else None
    keys = repository.fetch_group_keys_sql(
        db,
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=flt.side,
        result=flt.result,
        currency=flt.currency,
        market_profile=flt.market_profile,
        symbol=flt.symbol,
        view=view,
        limit=key_limit,
        offset=offset,
    )
    selected_keys = keys[:limit] if limit is not None else keys
    if not selected_keys:
        return []

    if not include_trades:
        first_key = selected_keys[-1]
        last_key = selected_keys[0]
        first_end = first_key if view == "day" else _add_days(first_key, 6)
        last_end = last_key if view == "day" else _add_days(last_key, 6)
        group_from_epoch, _ = day_bounds(first_key, first_end)
        _, group_to_epoch = day_bounds(last_key, last_end)
        summary_rows, day_rows = repository.fetch_group_summaries_sql(
            db,
            user_id=user_id,
            logins=logins,
            from_epoch=from_epoch,
            to_epoch=to_epoch,
            side=flt.side,
            result=flt.result,
            currency=flt.currency,
            market_profile=flt.market_profile,
            symbol=flt.symbol,
            view=view,
            keys=selected_keys,
            group_from_epoch=int(group_from_epoch or 0),
            group_to_epoch=int(group_to_epoch or 0),
        )
        summaries = {str(row["group_key"]): row for row in summary_rows}
        days_by_group: dict[str, list[DayStatOut]] = {}
        for row in day_rows:
            days_by_group.setdefault(str(row["group_key"]), []).append(
                DayStatOut(
                    day=str(row["day"]),
                    net=_round(float(row["net"] or 0)),
                    count=int(row["count"] or 0),
                    wins=int(row["wins"] or 0),
                )
            )
        result: list[GroupOut] = []
        for key in selected_keys:
            summary = summaries.get(key)
            if summary is None:
                continue
            days = days_by_group.get(key, [])
            result.append(
                GroupOut(
                    key=key,
                    startDay=days[0].day if days else key,
                    endDay=days[-1].day if days else (_add_days(key, 6) if view == "week" else key),
                    stats=_stats_from_sql(summary),
                    series=[
                        SeriesPoint(index=0, value=0.0),
                        *[
                            SeriesPoint(
                                index=int(item["index"]),
                                value=_round(float(item["value"] or 0)),
                            )
                            for item in (summary.get("series") or [])
                        ],
                    ],
                    days=days,
                    trades=[],
                )
            )
        put_cached_object(user_id, flt, result, cache_variant)
        return result

    result: list[GroupOut] = []
    for key in selected_keys:
        result.append(
            _load_group(
                db,
                user,
                flt,
                view,
                key,
                logins=logins,
                include_trades=include_trades,
            )
        )
    put_cached_object(user_id, flt, result, cache_variant)
    return result


def _load_group(
    db: DBConnection,
    user: DBRow,
    flt: TradeFilter,
    view: str,
    key: str,
    *,
    logins: list[int],
    include_trades: bool = True,
) -> GroupOut:
    end_day = key if view == "day" else _add_days(key, 6)
    from_epoch, to_epoch = day_bounds(key, end_day)
    rows = repository.fetch_closed_trades(
        db,
        user_id=int(user["id"]),
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
    )
    trades = _apply_filters([_to_item(row) for row in rows], flt)
    trades = sorted(trades, key=lambda item: (item.closeTime, item.id), reverse=True)
    if not trades:
        return GroupOut(
            key=key,
            startDay=key,
            endDay=end_day,
            stats=compute_stats([]),
            series=[SeriesPoint(index=0, value=0.0)],
            days=[],
            trades=[],
        )
    days = sorted(_overview_days(trades), key=lambda item: item.day)
    trading_days = [item.closeTime for item in trades]
    return GroupOut(
        key=key,
        startDay=beijing_day(min(trading_days)),
        endDay=beijing_day(max(trading_days)),
        stats=compute_stats(trades),
        series=cumulative_series(trades),
        days=days,
        trades=trades if include_trades else [],
    )


def group_trades(
    db: DBConnection,
    user: DBRow,
    flt: TradeFilter,
    view: str,
    key: str,
) -> list[TradeItem]:
    user_id = int(user["id"])
    cache_variant = f"group-trades:{view}:{key}"
    cached = get_cached_object(user_id, flt, cache_variant)
    if isinstance(cached, list):
        return cached
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        return []
    result = _load_group(
        db,
        user,
        flt,
        view,
        key,
        logins=logins,
        include_trades=True,
    ).trades
    put_cached_object(user_id, flt, result, cache_variant)
    return result


def calendar(db: DBConnection, user: DBRow, flt: TradeFilter, month: str) -> list[CalendarDayOut]:
    year, month_number = (int(part) for part in month.split("-"))
    first_day = date(year, month_number, 1)
    next_month = date(year + (1 if month_number == 12 else 0), 1 if month_number == 12 else month_number + 1, 1)
    from_epoch = int(datetime.combine(first_day, datetime.min.time(), tzinfo=PLATFORM_TZ).timestamp())
    to_epoch = int(datetime.combine(next_month, datetime.min.time(), tzinfo=PLATFORM_TZ).timestamp())
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        return []
    range_from_epoch, range_to_epoch = day_bounds(flt.from_day, flt.to_day)
    rows = repository.fetch_calendar_days(
        db,
        user_id=int(user["id"]),
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        range_from_epoch=range_from_epoch,
        range_to_epoch=range_to_epoch,
        side=flt.side,
        result=flt.result,
        currency=flt.currency,
        market_profile=flt.market_profile,
        symbol=flt.symbol,
    )
    return [CalendarDayOut(day=str(row["day"]), net=float(row["net"] or 0), count=int(row["count"] or 0)) for row in rows]


def bounds(db: DBConnection, user: DBRow, flt: TradeFilter) -> BoundsOut:
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        return BoundsOut(earliestDay=None, latestDay=None)
    row = repository.fetch_closed_trade_bounds(
        db,
        int(user["id"]),
        logins,
        market_profile=flt.market_profile,
    )
    if row is None or row["earliest_epoch"] is None:
        return BoundsOut(earliestDay=None, latestDay=None)
    return BoundsOut(
        earliestDay=beijing_day(int(row["earliest_epoch"])),
        latestDay=beijing_day(int(row["latest_epoch"])),
    )


def _day_epoch(day: str) -> int:
    return int(datetime.combine(date.fromisoformat(day), datetime.min.time(), tzinfo=PLATFORM_TZ).timestamp())


def _add_days(day: str, offset: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=offset)).isoformat()


def _overview_days(items: list[TradeItem]) -> list[DayStatOut]:
    buckets: dict[str, dict] = {}
    for item in items:
        day = beijing_day(item.closeTime)
        bucket = buckets.setdefault(day, {"net": 0.0, "count": 0, "wins": 0})
        bucket["net"] = _round(bucket["net"] + item.netPnl)
        bucket["count"] += 1
        if item.netPnl > 0:
            bucket["wins"] += 1
    return [
        DayStatOut(day=day, net=value["net"], count=value["count"], wins=value["wins"])
        for day, value in sorted(buckets.items(), reverse=True)
    ]


def _overview_stats(items: list[TradeItem], days: list[DayStatOut]) -> OverviewStatsOut:
    stats = compute_stats(items)
    return OverviewStatsOut(
        count=stats.count,
        net=stats.net,
        winners=stats.winners,
        losers=stats.losers,
        breakEven=stats.breakeven,
        winRate=stats.winRate,
        profitFactor=stats.profitFactor,
        avgWin=stats.avgWin,
        avgLoss=stats.avgLoss,
        winDays=sum(1 for day in days if day.net > 0),
        flatDays=sum(1 for day in days if day.net == 0),
        lossDays=sum(1 for day in days if day.net < 0),
        dayWinRate=(sum(1 for day in days if day.net > 0) / len(days)) if days else 0.0,
        days=days,
    )


def _overview_days_from_sql(rows: list[dict]) -> list[DayStatOut]:
    return [
        DayStatOut(
            day=str(row["day"]),
            net=_round(float(row["net"] or 0)),
            count=int(row["count"] or 0),
            wins=int(row["wins"] or 0),
        )
        for row in rows
    ]


def _overview_stats_from_sql(row: dict, days: list[DayStatOut]) -> OverviewStatsOut:
    count = int(row.get("count") or 0)
    winners = int(row.get("winners") or 0)
    losers = int(row.get("losers") or 0)
    win_sum = float(row.get("win_sum") or 0)
    loss_sum = float(row.get("loss_sum") or 0)
    return OverviewStatsOut(
        count=count,
        net=_round(float(row.get("net") or 0)),
        winners=winners,
        losers=losers,
        breakEven=int(row.get("breakeven") or 0),
        winRate=(winners / count) if count else 0.0,
        profitFactor=_round(win_sum / loss_sum) if loss_sum > 0 else None,
        avgWin=_round(win_sum / winners) if winners > 0 else None,
        avgLoss=_round(loss_sum / losers) if losers > 0 else None,
        winDays=sum(1 for day in days if day.net > 0),
        flatDays=sum(1 for day in days if day.net == 0),
        lossDays=sum(1 for day in days if day.net < 0),
        dayWinRate=(sum(1 for day in days if day.net > 0) / len(days)) if days else 0.0,
        days=days,
    )


def _consistency(days: list[DayStatOut], latest_day: str | None) -> ConsistencyOut:
    if not latest_day:
        return ConsistencyOut(cells=[], weeks=[])
    by_day = {day.day: day for day in days}
    end_week = beijing_week_start(_day_epoch(latest_day))
    weeks = [_add_days(end_week, -7 * index) for index in range(12, -1, -1)]
    max_abs = max(1.0, max((abs(day.net) for day in days), default=1.0))
    cells: list[ConsistencyCellOut] = []
    for week in weeks:
        for offset in range(7):
            day = _add_days(week, offset)
            if day > latest_day:
                continue
            entry = by_day.get(day)
            cells.append(
                ConsistencyCellOut(
                    day=day,
                    net=entry.net if entry else 0.0,
                    count=entry.count if entry else 0,
                    intensity=(min(1.0, abs(entry.net) / max_abs) * 0.6) if entry else 0.0,
                )
            )
    return ConsistencyOut(cells=cells, weeks=weeks)


def _downsample_points(points: list[ScatterPointOut], limit: int = 2000) -> list[ScatterPointOut]:
    """Deterministically cap scatter coordinates while keeping the x-axis spread."""
    if len(points) <= limit:
        return points
    ordered = sorted(range(len(points)), key=lambda index: (points[index].x, points[index].y))
    selected: set[int] = set()
    for rank in range(limit):
        selected.add(ordered[round(rank * (len(ordered) - 1) / (limit - 1))])
    # Preserve the visual top and bottom extremes even if the x-grid skips them.
    selected.add(min(range(len(points)), key=lambda index: points[index].y))
    selected.add(max(range(len(points)), key=lambda index: points[index].y))
    return [points[index] for index in sorted(selected)]


def _compute_overview(db: DBConnection, user: DBRow, flt: TradeFilter) -> OverviewOut:
    user_id = int(user["id"])
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        return OverviewOut(
            stats=_overview_stats_from_sql({}, []),
            score=composite_score([]),
            recent=[],
            consistency=ConsistencyOut(cells=[], weeks=[]),
            timeEntry=[],
            timeExit=[],
            duration=[],
        )

    from_epoch, to_epoch = day_bounds(flt.from_day, flt.to_day)
    row, day_rows, recent_rows = repository.fetch_trade_overview_sql(
        db,
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=flt.side,
        result=flt.result,
        currency=flt.currency,
        market_profile=flt.market_profile,
        symbol=flt.symbol,
    )
    scatter_rows = repository.fetch_trade_overview_scatter_sql(
        db,
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=flt.side,
        result=flt.result,
        currency=flt.currency,
        market_profile=flt.market_profile,
        symbol=flt.symbol,
        bucket_count=256,
    )
    days = _overview_days_from_sql(day_rows)
    latest_day = days[0].day if days else None
    recent = [
        OverviewRecentOut(
            id=f"{row['account_login']}-{row['ticket']}",
            closeTime=int(row["deal_time"]),
            symbol=str(row["symbol"] or ""),
            side="buy" if int(row["type"]) == 0 else "sell",
            netPnl=_round(float(row["net"] or 0)),
        )
        for row in recent_rows
    ]
    count = int(row.get("count") or 0)
    scatter: dict[str, list[ScatterPointOut]] = {
        "timeEntry": [],
        "timeExit": [],
        "duration": [],
    }
    for point in scatter_rows:
        kind = str(point["kind"])
        if kind in scatter:
            scatter[kind].append(
                ScatterPointOut(
                    x=float(point["x"] or 0),
                    y=_round(float(point["y"] or 0)),
                )
            )
    valid_r = int(row.get("valid_r") or 0)
    average_r = float(row["expectancy"]) if row.get("expectancy") is not None else None
    average_win_r = float(row["avg_win_r"]) if row.get("avg_win_r") is not None else None
    average_loss_r = float(row["avg_loss_r"]) if row.get("avg_loss_r") is not None else None
    score = composite_score_from_metrics(
        sample_trades=count,
        valid_r=valid_r,
        net_pnl=float(row.get("net") or 0),
        money_drawdown=float(row.get("money_drawdown") or 0),
        drawdown_r=float(row.get("drawdown_r") or 0),
        worst_r=float(row["worst_r"]) if row.get("worst_r") is not None else 0.0,
        expectancy=average_r if valid_r else None,
        avg_win_r=average_win_r,
        avg_loss_r=average_loss_r,
        win_rate=(int(row.get("winners") or 0) / count) if count else 0.0,
        day_values=[day.net for day in days],
    )
    result = OverviewOut(
        stats=_overview_stats_from_sql(row, days),
        score=score,
        recent=recent,
        consistency=_consistency(days, latest_day),
        timeEntry=scatter["timeEntry"],
        timeExit=scatter["timeExit"],
        duration=scatter["duration"],
    )
    return result


def overview(db: DBConnection, user: DBRow, flt: TradeFilter) -> OverviewOut:
    user_id = int(user["id"])
    return get_or_set_object(
        user_id,
        flt,
        "overview",
        lambda: _compute_overview(db, user, flt),
    )


def symbols(db: DBConnection, user: DBRow, flt: TradeFilter) -> list[str]:
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        return []
    return repository.distinct_symbols(
        db,
        int(user["id"]),
        logins=logins,
        currency=flt.currency,
        market_profile=flt.market_profile,
    )


def symbol_options(db: DBConnection, user: DBRow, flt: TradeFilter) -> list[SymbolOptionOut]:
    logins = _resolve_logins(db, user, flt.account_id_list())
    if not logins:
        return []
    rows = repository.distinct_symbol_options(
        db,
        int(user["id"]),
        logins=logins,
        currency=flt.currency,
        market_profile=flt.market_profile,
    )
    grouped: dict[str, list[SymbolAccountOut]] = {}
    for row in rows:
        symbol = str(row["symbol"] or "")
        if not symbol:
            continue
        grouped.setdefault(symbol, []).append(
            SymbolAccountOut(
                account_id=int(row["account_id"]),
                account_name=str(row["account_name"] or row["account_id"]),
            )
        )
    return [SymbolOptionOut(symbol=symbol, accounts=accounts) for symbol, accounts in sorted(grouped.items())]


def currencies(db: DBConnection, user: DBRow) -> list[str]:
    return repository.distinct_currencies(db, int(user["id"]))
