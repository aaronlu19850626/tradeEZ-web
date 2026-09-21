from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator

PLATFORM_TZ = ZoneInfo("Asia/Shanghai")
DAY_RE = r"\d{4}-\d{2}-\d{2}"

ScoreDimensionKey = Literal["expectancy", "risk", "payoff", "recovery", "consistency", "winRate"]


class ScoreDimensionOut(BaseModel):
    key: ScoreDimensionKey
    weight: float
    raw: float | None
    score: float


class CompositeScoreOut(BaseModel):
    insufficient: bool
    sampleTrades: int
    validR: int
    total: float | None
    dimensions: list[ScoreDimensionOut]
    weakest: list[ScoreDimensionKey]


def beijing_day(epoch_seconds: int) -> str:
    """Return the Beijing (UTC+8) calendar day for a UTC epoch."""
    return datetime.fromtimestamp(epoch_seconds, tz=PLATFORM_TZ).strftime("%Y-%m-%d")


def beijing_week_start(epoch_seconds: int) -> str:
    """Return the Beijing Monday that starts the week containing the epoch."""
    local = datetime.fromtimestamp(epoch_seconds, tz=PLATFORM_TZ).date()
    return (local - timedelta(days=local.weekday())).isoformat()


def day_bounds(from_day: str | None, to_day: str | None) -> tuple[int | None, int | None]:
    """Convert inclusive day keys to a [start_epoch, end_epoch) UTC range."""
    start: int | None = None
    end: int | None = None
    if from_day:
        start = int(datetime.combine(date.fromisoformat(from_day), datetime.min.time(), tzinfo=PLATFORM_TZ).timestamp())
    if to_day:
        next_day = date.fromisoformat(to_day) + timedelta(days=1)
        end = int(datetime.combine(next_day, datetime.min.time(), tzinfo=PLATFORM_TZ).timestamp())
    return start, end


class TradeItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    accountId: int
    accountName: str | None
    accountLogin: str
    currency: str | None
    symbol: str
    side: Literal["buy", "sell"]
    volume: float
    openPrice: float | None
    closePrice: float
    slPrice: float | None
    tpPrice: float | None
    openTime: int
    closeTime: int
    profit: float
    swap: float
    commission: float
    grossPnl: float
    netPnl: float
    roiPct: float | None
    rMultiple: float | None
    points: float | None
    durationSec: int
    strategy: str | None
    magic: int


class StatsOut(BaseModel):
    count: int
    gross: float
    net: float
    commission: float
    swap: float
    winners: int
    losers: int
    breakeven: int
    winRate: float
    volume: float
    profitFactor: float | None
    avgWin: float | None
    avgLoss: float | None
    winSum: float
    lossSum: float
    avgR: float | None
    netPeak: float
    netTrough: float


class SeriesPoint(BaseModel):
    index: int
    value: float


class SummaryOut(BaseModel):
    stats: StatsOut
    series: list[SeriesPoint]


class GroupOut(BaseModel):
    key: str
    startDay: str
    endDay: str
    stats: StatsOut
    series: list[SeriesPoint]
    trades: list[TradeItem]


class CalendarDayOut(BaseModel):
    day: str
    net: float
    count: int


class TradeFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_ids: str | None = None
    from_day: str | None = Field(default=None, pattern=DAY_RE)
    to_day: str | None = Field(default=None, pattern=DAY_RE)
    side: Literal["all", "buy", "sell"] = "all"
    result: Literal["all", "win", "loss", "flat"] = "all"
    currency: str | None = None
    symbol: str | None = None

    @field_validator("account_ids", mode="before")
    @classmethod
    def normalize_account_ids(cls, value):
        if value is None or value == "":
            return None
        if isinstance(value, str):
            return value
        if isinstance(value, (list, tuple)):
            return ",".join(str(item) for item in value)
        return str(value)

    @field_validator("symbol")
    @classmethod
    def strip_symbol(cls, value):
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value):
        if value is None:
            return None
        value = value.strip().upper()
        return value or None

    def account_id_list(self) -> list[int] | None:
        if not self.account_ids:
            return None
        return [int(part) for part in self.account_ids.split(",") if part.strip()]

    def symbol_list(self) -> list[str] | None:
        if not self.symbol:
            return None
        values = [part.strip() for part in self.symbol.split(",") if part.strip()]
        return values or None


class TradeQuery(TradeFilter):
    sort: str = "closeTime"
    order: Literal["asc", "desc"] = "desc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=100, ge=1, le=100)


class TradePageOut(BaseModel):
    items: list[TradeItem]
    total: int
    page: int
    page_size: int


class BoundsOut(BaseModel):
    earliestDay: str | None
    latestDay: str | None


class DayStatOut(BaseModel):
    day: str
    net: float
    count: int
    wins: int


class OverviewStatsOut(BaseModel):
    count: int
    net: float
    winners: int
    losers: int
    breakEven: int
    winRate: float
    profitFactor: float | None
    avgWin: float | None
    avgLoss: float | None
    winDays: int
    flatDays: int
    lossDays: int
    dayWinRate: float
    days: list[DayStatOut]


class DatePointOut(BaseModel):
    date: str
    label: str
    value: float


class DrawdownOut(BaseModel):
    points: list[DatePointOut]
    maxDrawdown: float


class ConsistencyCellOut(BaseModel):
    day: str
    net: float
    count: int
    intensity: float


class ConsistencyOut(BaseModel):
    cells: list[ConsistencyCellOut]
    weeks: list[str]


class ScatterPointOut(BaseModel):
    x: float
    y: float


class OverviewRecentOut(BaseModel):
    id: str
    closeTime: int
    symbol: str
    netPnl: float


class OverviewOut(BaseModel):
    stats: OverviewStatsOut
    score: CompositeScoreOut
    cumulative: list[DatePointOut]
    cumulativeRecent: list[DatePointOut]
    drawdown: DrawdownOut
    recent: list[OverviewRecentOut]
    consistency: ConsistencyOut
    timeEntry: list[ScatterPointOut]
    timeExit: list[ScatterPointOut]
    duration: list[ScatterPointOut]
