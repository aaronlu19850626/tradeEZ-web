"""Compatibility boundaries for the current position view, not the future Trade model."""
import pytest

from app.trades.aggregation import build_positions, classify_strategy


def row(position, entry, volume, price, when, **extra):
    return {
        "position_id": position, "entry": entry, "volume": volume,
        "price": price, "deal_time": when, "open_time": 100,
        "symbol": "XAUUSD", "type": 0 if entry == 0 else 1,
        "profit": 0, "swap": 0, "commission": 0,
        "sl_price": 90, "tp_price": 130, "magic": 0, "comment": "",
        **extra,
    }


def test_partial_closes_produce_one_weighted_position():
    rows = [
        row(1, 0, 3, 100, 100),
        row(1, 1, 1, 110, 200, profit=10, commission=-1),
        row(1, 1, 1, 120, 300, profit=20, swap=-2),
        row(1, 1, 1, 130, 400, profit=30, commission=-1),
    ]
    partial = build_positions(123, rows[:-1])[0]
    assert partial.is_closed is False
    assert partial.close_time is None
    assert partial.hold_seconds is None
    positions = build_positions(123, rows)
    assert len(positions) == 1
    result = positions[0]
    assert result.is_closed is True
    assert result.volume_in == result.volume_out == 3
    assert result.open_price == 100
    assert result.close_price == 120
    assert result.net_pnl == 56
    assert result.commission_total == -2
    assert result.swap_total == -2
    assert result.hold_seconds == 300
    assert build_positions(123, rows, include_closed=False) == []


def test_nearby_positions_stay_separate_and_close_only_needs_review():
    rows = [row(1, 0, 1, 100, 100), row(2, 0, 1, 100, 101), row(3, 1, 1, 110, 102)]
    results = build_positions(123, rows)
    assert {p.position_id for p in results} == {1, 2, 3}
    assert next(p for p in results if p.position_id == 3).reconciliation_status == "needs_review"
    assert all(p.account_login == 123 for p in results)


def test_cross_day_hold_time_and_sell_direction():
    rows = [row(1, 0, 1, 100, 86300, open_time=86300, type=1), row(1, 1, 1, 90, 86500, type=0)]
    result = build_positions(123, rows)[0]
    assert result.direction == "sell"
    assert result.hold_seconds == 200
    assert result.close_time == 86500


def test_opening_fees_out_by_and_untrusted_open_time():
    rows = [row(1, 0, 1, 100, 100, open_time=300, commission=-2),
            row(1, 3, 1, 110, 300, profit=10, commission=-1)]
    result = build_positions(123, reversed(rows))[0]
    assert result.open_time == 100
    assert result.hold_seconds == 200
    assert result.net_pnl == 7
    assert result.is_closed


def test_reversal_does_not_double_count_opening_volume():
    rows = [row(1, 0, 1, 100, 100), row(1, 2, 1.5, 110, 200, type=1, profit=10)]
    result = build_positions(123, rows)[0]
    assert result.volume_in == 1.5
    assert result.volume_out == 1
    assert result.remaining_volume == .5
    assert result.direction == "mixed"
    assert result.reconciliation_status == "needs_review"
    assert not result.is_closed


def test_overclose_is_not_reported_as_closed():
    result = build_positions(123, [row(1, 0, 1, 100, 100), row(1, 1, 2, 110, 200)])[0]
    assert "volume_mismatch" in result.reconciliation_issues
    assert not result.is_closed


@pytest.mark.parametrize("magic,comment,expected", [
    (920717, "", "scalp"), (0, "TradeEZ-TR", "trend"),
    (123, "", "other"), (0, "", "manual"),
])
def test_strategy_classification_remains_compatible(magic, comment, expected):
    assert classify_strategy(magic, comment) == expected
