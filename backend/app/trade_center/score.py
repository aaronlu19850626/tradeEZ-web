from __future__ import annotations

import math

from .schemas import (
    CompositeScoreOut,
    ScoreDimensionKey,
    ScoreDimensionOut,
    TradeItem,
)


def _round(value: float, digits: int = 2) -> float:
    factor = 10**digits
    return round(value * factor) / factor


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _piecewise(value: float, points: list[tuple[float, float]]) -> float:
    if not math.isfinite(value):
        return 0.0
    first, last = points[0], points[-1]
    if value <= first[0]:
        return first[1]
    if value >= last[0]:
        return last[1]
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if value <= x2:
            ratio = (value - x1) / (x2 - x1 or 1.0)
            return y1 + ratio * (y2 - y1)
    return last[1]


def _max_drawdown(series: list[float]) -> float:
    peak = 0.0
    worst = 0.0
    for value in series:
        peak = max(peak, value)
        worst = min(worst, value - peak)
    return abs(worst)


def _daily_net(items: list[TradeItem]) -> list[float]:
    from .schemas import beijing_day

    buckets: dict[str, float] = {}
    for item in items:
        day = beijing_day(item.closeTime)
        buckets[day] = buckets.get(day, 0.0) + item.netPnl
    return list(buckets.values())


def composite_score_from_metrics(
    *,
    sample_trades: int,
    valid_r: int,
    net_pnl: float,
    money_drawdown: float,
    drawdown_r: float,
    worst_r: float,
    expectancy: float | None,
    avg_win_r: float | None,
    avg_loss_r: float | None,
    win_rate: float,
    day_values: list[float],
) -> CompositeScoreOut:
    payoff = avg_win_r / abs(avg_loss_r) if avg_win_r is not None and avg_loss_r not in (None, 0) else None
    recovery = 0.0
    if money_drawdown > 0:
        recovery = net_pnl / money_drawdown
    elif net_pnl > 0:
        recovery = 3.0

    win_day_rate = (
        sum(1 for value in day_values if value > 0) / len(day_values) if day_values else 0.0
    )
    day_abs_mean = abs(_mean(day_values))
    day_std = (
        math.sqrt(_mean([(value - _mean(day_values)) ** 2 for value in day_values]))
        if day_values
        else 0.0
    )
    volatility_penalty = (
        _clamp(1 - day_std / day_abs_mean / 3.0, 0.6, 1.0) if day_abs_mean > 0 else 0.6
    )
    risk_score = 0.6 * _piecewise(
        drawdown_r,
        [(5, 100), (10, 80), (20, 50), (40, 0)],
    ) + 0.4 * _piecewise(-worst_r, [(2, 100), (3, 75), (4, 50), (6, 0)])

    dimensions = [
        ScoreDimensionOut(
            key="expectancy",
            weight=0.25,
            raw=_round(expectancy, 3) if expectancy is not None else None,
            score=0 if expectancy is None else _piecewise(expectancy, [(-0.5, 0), (0, 50), (0.3, 80), (0.6, 100)]),
        ),
        ScoreDimensionOut(key="risk", weight=0.2, raw=_round(drawdown_r, 2), score=risk_score),
        ScoreDimensionOut(
            key="payoff",
            weight=0.15,
            raw=_round(payoff, 3) if payoff is not None else None,
            score=0 if payoff is None else _piecewise(payoff, [(0.8, 0), (1, 50), (1.5, 85), (2, 100)]),
        ),
        ScoreDimensionOut(
            key="recovery",
            weight=0.15,
            raw=_round(recovery, 3),
            score=_piecewise(recovery, [(0, 0), (1, 50), (2, 80), (3, 100)]),
        ),
        ScoreDimensionOut(
            key="consistency",
            weight=0.15,
            raw=_round(win_day_rate, 4),
            score=_piecewise(win_day_rate, [(0.3, 0), (0.45, 50), (0.55, 75), (0.65, 100)])
            * volatility_penalty,
        ),
        ScoreDimensionOut(
            key="winRate",
            weight=0.1,
            raw=_round(win_rate, 4),
            score=_piecewise(win_rate, [(0.3, 0), (0.5, 60), (0.65, 85), (0.8, 100)]),
        ),
    ]
    for dimension in dimensions:
        dimension.score = _round(dimension.score, 1)
    insufficient = sample_trades < 30 or valid_r < 20
    total = (
        None
        if insufficient
        else _round(sum(dimension.score * dimension.weight for dimension in dimensions), 1)
    )
    weakest = [dimension.key for dimension in sorted(dimensions, key=lambda item: item.score / 100.0)[:2]]
    return CompositeScoreOut(
        insufficient=insufficient,
        sampleTrades=sample_trades,
        validR=valid_r,
        total=total,
        dimensions=dimensions,
        weakest=weakest,
    )


def composite_score(items: list[TradeItem]) -> CompositeScoreOut:
    r_trades = [item for item in items if item.rMultiple is not None]
    r_values = [float(item.rMultiple) for item in r_trades]
    wins = [item for item in items if item.netPnl > 0]
    win_r = [value for value in r_values if value > 0]
    loss_r = [value for value in r_values if value < 0]

    ordered = sorted(items, key=lambda item: (item.closeTime, item.id))
    money_curve = []
    running = 0.0
    for item in ordered:
        running += item.netPnl
        money_curve.append(running)
    r_curve = []
    running_r = 0.0
    for item in sorted(r_trades, key=lambda item: (item.closeTime, item.id)):
        running_r += float(item.rMultiple)
        r_curve.append(running_r)

    return composite_score_from_metrics(
        sample_trades=len(items),
        valid_r=len(r_values),
        net_pnl=sum(item.netPnl for item in items),
        money_drawdown=_max_drawdown(money_curve),
        drawdown_r=_max_drawdown(r_curve),
        worst_r=min(r_values) if r_values else 0.0,
        expectancy=_mean(r_values) if r_values else None,
        avg_win_r=_mean(win_r) if win_r else None,
        avg_loss_r=_mean(loss_r) if loss_r else None,
        win_rate=len(wins) / len(items) if items else 0.0,
        day_values=_daily_net(items),
    )
