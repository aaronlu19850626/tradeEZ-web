import pytest
from app.trades.lifecycle import build_lifecycles


def fact(ticket, entry, kind, volume, when, **extra):
    return dict(ticket=ticket, position_id=7, order_id=ticket, entry=entry, type=kind,
                volume=volume, price=100, deal_time=when, open_time=when,
                symbol="GOLD#", profit=extra.get("profit", 0), swap=extra.get("swap", 0),
                commission=extra.get("commission", 0), magic=0, comment="", sl_price=0, tp_price=0)


def test_reversal_splits_trades_and_conserves_every_fee():
    rows = [fact(1, 0, 0, 1, 100, commission=-2),
            fact(2, 2, 1, 1.5, 200, profit=10, swap=-1, commission=-3),
            fact(3, 3, 0, .5, 300, profit=5, commission=-1)]
    trades = build_lifecycles(123, reversed(rows))
    assert len(trades) == 2
    first, second = (t.summary for t in trades)
    assert first.direction == "buy" and second.direction == "sell"
    assert first.is_closed and second.is_closed
    assert (first.volume_in, first.volume_out) == (1, 1)
    assert (second.volume_in, second.volume_out) == (.5, .5)
    assert (first.open_time, first.close_time, second.open_time, second.close_time) == (100, 200, 200, 300)
    assert first.net_pnl == 5 and second.net_pnl == 3
    for field in ("profit", "swap", "commission"):
        allocated = sum(a[field] for trade in trades for a in trade.allocations)
        assert allocated == pytest.approx(sum(row[field] for row in rows))
    assert trades[1].allocations[0]["method"] == "reversal_volume_proportion"


def test_partial_close_stays_in_one_trade_and_flat_reopen_splits():
    rows = [fact(1, 0, 0, 1, 100), fact(2, 1, 1, .4, 200)]
    partial = build_lifecycles(123, rows)
    assert len(partial) == 1 and partial[0].summary.remaining_volume == .6
    assert partial[0].summary.reconciliation_status == "partial"
    rows += [fact(3, 1, 1, .6, 300), fact(4, 0, 1, .2, 400)]
    trades = build_lifecycles(123, rows)
    assert len(trades) == 2 and trades[0].summary.is_closed
    assert trades[1].anchor_ticket == 4


def test_missing_reversal_history_remains_reviewable():
    trade = build_lifecycles(123, [fact(2, 2, 1, 1.5, 200)])[0]
    assert trade.summary.reconciliation_status == "needs_review"
    assert not trade.summary.is_closed
