from app.trades.analytics import summarize


def test_performance_drawdown_includes_initial_loss_and_intraday_sequence():
    result = summarize([{"net_pnl": value} for value in (-10, 30, -25, 5, 0)])
    assert result["max_drawdown"] == 25
    assert result["net_pnl"] == 0
    assert result["wins"] == 2
    assert result["losses"] == 2
    assert result["breakeven"] == 1
    assert result["win_rate"] == 40
    assert result["profit_factor"] == 1


def test_empty_and_no_loss_ratios_are_not_infinite():
    assert summarize([])["win_rate"] is None
    assert summarize([{"net_pnl": 1}])["profit_factor"] is None
    assert summarize([{"net_pnl": -3}])["max_drawdown"] == 3


def test_decimal_totals_do_not_invent_winning_trades():
    assert summarize([{"net_pnl": .1}, {"net_pnl": .2}, {"net_pnl": -.3}])["net_pnl"] == 0
