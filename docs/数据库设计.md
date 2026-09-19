# TradeSync 数据库设计 (PostgreSQL)

版本 v1.0 · 2026-07-21

多租户隔离：每张业务表可追溯到 `user_id`，查询强制过滤。
成交只增不改（不可篡改档案）。用 Alembic 管理迁移。

---

## 表清单

| 表 | 用途 |
|---|---|
| users | 会员 |
| accounts | MT5 账户绑定 + 同步 Key |
| symbols | 品种规格（算 R/金额） |
| deals | 原始成交（唯一真相源） |
| positions | 配对后的完整交易 |
| account_snapshots | 净值时序 |
| daily_stats | 每日物化聚合 |
| trading_rules | 用户纪律规则（P1） |
| rule_violations | 违规记录（P1） |
| review_notes | 复盘标注（P1） |
| market_briefings | AI 盘前简报（P2） |
| subscriptions | 订阅计费 |

---

## DDL

```sql
-- ============ 会员 ============
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tier          TEXT NOT NULL DEFAULT 'free',
    tz            TEXT NOT NULL DEFAULT 'UTC',   -- 用户展示时区
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ MT5 账户绑定 ============
CREATE TABLE accounts (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mt5_login      BIGINT NOT NULL,
    broker         TEXT,
    server_gmt_off INT,                    -- 服务器相对GMT偏移(秒)
    reset_hour     INT NOT NULL DEFAULT 4, -- 统计日翻日(北京时)
    reset_minute   INT NOT NULL DEFAULT 30,
    key_prefix     TEXT UNIQUE NOT NULL,   -- 同步Key前缀(索引)
    key_hash       TEXT NOT NULL,          -- sha256(secret)
    key_revoked    BOOLEAN NOT NULL DEFAULT false,
    last_seen_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, mt5_login)
);
CREATE INDEX idx_accounts_user ON accounts(user_id);

-- ============ 品种规格 ============
CREATE TABLE symbols (
    id            BIGSERIAL PRIMARY KEY,
    account_id    BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    digits        INT,
    point         DOUBLE PRECISION,
    tick_value    DOUBLE PRECISION,        -- 每point每手价值
    contract_size DOUBLE PRECISION,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id, name)
);

-- ============ 原始成交(唯一真相源) ============
CREATE TABLE deals (
    id           BIGSERIAL PRIMARY KEY,
    account_id   BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    ticket       BIGINT NOT NULL,          -- DEAL_TICKET,幂等键
    position_id  BIGINT NOT NULL,
    order_id     BIGINT,
    symbol       TEXT NOT NULL,
    entry        SMALLINT NOT NULL,        -- 0=IN 1=OUT 2=INOUT
    type         SMALLINT NOT NULL,        -- 0=buy 1=sell
    volume       DOUBLE PRECISION NOT NULL,
    price        DOUBLE PRECISION NOT NULL,
    sl_price     DOUBLE PRECISION,
    tp_price     DOUBLE PRECISION,
    profit       DOUBLE PRECISION NOT NULL DEFAULT 0,
    swap         DOUBLE PRECISION NOT NULL DEFAULT 0,
    commission   DOUBLE PRECISION NOT NULL DEFAULT 0,
    magic        BIGINT NOT NULL DEFAULT 0,
    comment      TEXT,
    deal_time    TIMESTAMPTZ NOT NULL,
    stat_day     DATE NOT NULL,            -- 按成交时间归日
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id, ticket)
);
CREATE INDEX idx_deals_acc_day ON deals(account_id, stat_day);
CREATE INDEX idx_deals_pos ON deals(account_id, position_id);

-- ============ 完整交易(服务端配对生成) ============
CREATE TABLE positions (
    id             BIGSERIAL PRIMARY KEY,
    account_id     BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    position_id    BIGINT NOT NULL,
    symbol         TEXT NOT NULL,
    strategy       TEXT NOT NULL,          -- scalp/trend/manual(按IN成交magic)
    direction      SMALLINT NOT NULL,      -- 0=buy 1=sell
    volume         DOUBLE PRECISION,
    open_price     DOUBLE PRECISION,
    close_price    DOUBLE PRECISION,       -- 加权平均
    sl_price       DOUBLE PRECISION,
    open_time      TIMESTAMPTZ,
    close_time     TIMESTAMPTZ,            -- 未平为NULL
    hold_seconds   INT,
    net_pnl        DOUBLE PRECISION,
    planned_risk   DOUBLE PRECISION,       -- 1R金额;无SL为NULL
    r_multiple     DOUBLE PRECISION,       -- net_pnl/planned_risk;无SL为NULL
    is_closed      BOOLEAN NOT NULL DEFAULT false,
    stat_day       DATE,                   -- 按平仓时间归日;未平为NULL
    UNIQUE(account_id, position_id)
);
CREATE INDEX idx_pos_acc_day ON positions(account_id, stat_day, strategy);

-- ============ 净值时序(TimescaleDB hypertable 或按月分区) ============
CREATE TABLE account_snapshots (
    account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    ts          TIMESTAMPTZ NOT NULL,
    balance     DOUBLE PRECISION,
    equity      DOUBLE PRECISION,
    margin      DOUBLE PRECISION,
    free_margin DOUBLE PRECISION,
    PRIMARY KEY(account_id, ts)
);
-- SELECT create_hypertable('account_snapshots','ts');  -- 若用 TimescaleDB

-- ============ 每日物化聚合 ============
CREATE TABLE daily_stats (
    account_id     BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stat_day       DATE NOT NULL,
    strategy       TEXT NOT NULL,          -- 含 'all' 汇总
    trades         INT, wins INT, losses INT, evens INT,
    win_rate       DOUBLE PRECISION,
    gross_profit   DOUBLE PRECISION,
    gross_loss     DOUBLE PRECISION,
    profit_factor  DOUBLE PRECISION,
    net_pnl        DOUBLE PRECISION,
    avg_r          DOUBLE PRECISION,
    expectancy_r   DOUBLE PRECISION,
    max_win        DOUBLE PRECISION,
    max_loss       DOUBLE PRECISION,
    max_consec_win INT, max_consec_loss INT,
    avg_hold_sec   INT,
    PRIMARY KEY(account_id, stat_day, strategy)
);

-- ============ 纪律规则 (P1) ============
CREATE TABLE trading_rules (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    max_daily_loss    DOUBLE PRECISION,    -- 日最大亏损额
    max_daily_trades  INT,                 -- 单日最大笔数
    allowed_hours     TEXT,                -- 允许时段,如 "08:00-04:00"(北京)
    max_lot           DOUBLE PRECISION,
    require_sl        BOOLEAN DEFAULT true, -- 强制设止损
    cooldown_losses   INT,                  -- 连亏N笔后冷却
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ 违规记录 (P1) ============
CREATE TABLE rule_violations (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stat_day    DATE NOT NULL,
    rule_type   TEXT NOT NULL,   -- max_loss/max_trades/off_session/max_lot/no_sl/revenge
    detail      TEXT,
    position_id BIGINT,          -- 关联的交易(可空)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_viol_acc_day ON rule_violations(account_id, stat_day);

-- ============ 复盘标注 (P1) ============
CREATE TABLE review_notes (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL,   -- position/day
    position_id BIGINT,
    stat_day    DATE,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ AI 盘前简报 (P2) ============
CREATE TABLE market_briefings (
    id          BIGSERIAL PRIMARY KEY,
    brief_date  DATE NOT NULL,
    symbol      TEXT NOT NULL,
    fundamental TEXT,            -- 基本面(事件)
    technical   TEXT,            -- 技术面
    raw_sources JSONB,           -- 抓取来源留痕
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(brief_date, symbol)
);

-- ============ 订阅计费 ============
CREATE TABLE subscriptions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan        TEXT NOT NULL,   -- free/pro
    status      TEXT NOT NULL,   -- active/canceled/past_due
    provider    TEXT,            -- stripe...
    period_end  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 归日逻辑（stat_day 计算）

服务端存 UTC，按账户的北京 4:30 翻日点归日：

```
北京时间 = UTC + 8h
若 北京时间 < 当天 reset_hour:reset_minute → 归昨天,否则归今天
stat_day = 该北京日期
```

deals 按成交时间归日；positions 按平仓时间归日；未平仓 stat_day=NULL。

---

## 索引与性能

- 查询主路径：`(account_id, stat_day)`、`(account_id, position_id)`。
- 统计走物化表 `daily_stats`，避免每次扫 deals。
- `account_snapshots` 数据量大，用 TimescaleDB hypertable 或按月分区 + 定期降采样。
