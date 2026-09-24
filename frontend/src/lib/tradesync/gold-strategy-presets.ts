import type { StrategyMock, StrategyRule, StrategyRuleGroup } from "./strategy-center";

export interface GoldStrategyPreset extends StrategyMock {
  traderType: string;
  traderTypes: string[];
  technicalRoute: string;
  coverPrompt: string;
}

const CREATED_AT = "2026-09-23T00:00:00.000Z";
const COLORS = ["#6B4FC4", "#2E7D6B", "#B4534B", "#3767A5", "#8A6A3D", "#6A5A8C"];

function rule(id: string, name: string, critical = false): StrategyRule {
  return { id, name, outcome: "always", critical };
}

function group(id: string, name: string, rules: StrategyRule[]): StrategyRuleGroup {
  return { id, name, rules };
}

function preset({
  id,
  name,
  description,
  icon,
  color,
  traderType,
  technicalRoute,
  coverPrompt,
  groups,
}: {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  traderType: string;
  technicalRoute: string;
  coverPrompt: string;
  groups: StrategyRuleGroup[];
}): Omit<GoldStrategyPreset, "traderTypes" | "tags"> {
  return {
    id: `gold-${id}`,
    name,
    description,
    icon,
    color,
    status: "active",
    groups,
    trades: [],
    notes: "",
    publishedVersion: 1,
    draftVersion: null,
    versions: [
      {
        version: 1,
        status: "published",
        createdAt: CREATED_AT,
        publishedAt: CREATED_AT,
      },
    ],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    traderType,
    technicalRoute,
    coverPrompt,
  };
}

const RAW_GOLD_STRATEGY_PRESETS: Omit<GoldStrategyPreset, "traderTypes" | "tags">[] = [
  preset({
    id: "london-opening-range",
    name: "London Opening Range Breakout",
    description: "伦敦开盘后突破亚洲区间，捕捉日内波动扩张。",
    icon: "LO",
    color: COLORS[0],
    traderType: "日内突破交易者",
    technicalRoute: "开盘区间、波动率突破",
    coverPrompt:
      "London skyline silhouette, gold candlestick breaking an opening-range rectangle, premium financial editorial style.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-range", "亚洲盘形成可识别的稳定区间", true),
        rule("ctx-open", "伦敦开盘前没有重大异常跳空"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-break", "价格突破区间高点或低点", true),
        rule("entry-retest", "突破后回踩不重新进入区间"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-stop", "止损置于区间对侧或突破结构外侧"),
        rule("risk-fail", "重新进入区间并连续两根 5 分钟 K 线失去方向", true),
      ]),
      group("exit", "Exit & management", [
        rule("exit-partial", "第一目标按 1R 减仓"),
        rule("exit-trail", "剩余仓位沿 15 分钟结构移动保护"),
      ]),
    ],
  }),
  preset({
    id: "ny-open-drive",
    name: "New York Open Drive",
    description: "利用纽约开盘的方向性资金流，顺势交易开盘驱动。",
    icon: "NY",
    color: COLORS[3],
    traderType: "纽约时段日内交易者",
    technicalRoute: "动量、开盘驱动",
    coverPrompt: "New York night skyline with a disciplined gold price impulse, financial terminal aesthetic.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-session", "纽约开盘前波动没有过度耗尽"),
        rule("ctx-bias", "日线或 1 小时方向倾向明确"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-range", "开盘 15 分钟形成明确高低点", true),
        rule("entry-expansion", "突破时 ATR 或成交量扩张", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-stop", "止损位于开盘区间对侧"),
        rule("risk-chop", "价格进入窄幅震荡则取消计划"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-daily", "目标参考前一日高低点"),
        rule("exit-close", "纽约午盘前未延续则退出"),
      ]),
    ],
  }),
  preset({
    id: "asian-liquidity-sweep",
    name: "Asian Range Liquidity Sweep",
    description: "等待亚洲盘高低点被扫荡后，捕捉反向结构位移。",
    icon: "AS",
    color: COLORS[5],
    traderType: "ICT 与流动性交易者",
    technicalRoute: "流动性扫荡、结构反转",
    coverPrompt:
      "Asian city lights, liquidity pools, price sweeping range highs and lows, refined ICT visual metaphor.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-range", "亚洲高低点清晰且被市场反复测试"),
        rule("ctx-session", "伦敦或纽约时段出现扫荡"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-sweep", "价格扫过亚洲高点或低点", true),
        rule("entry-shift", "扫荡后形成反向结构突破", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-acceptance", "价格有效站稳扫荡方向则计划失效", true),
        rule("risk-stop", "止损放在扫荡极值外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-liquidity", "目标指向对侧流动性"),
        rule("exit-mid", "第一目标可设前一日中值"),
      ]),
    ],
  }),
  preset({
    id: "london-vwap-reversion",
    name: "London VWAP Reversion",
    description: "在趋势背景不强时，交易价格向 VWAP 的均值回归。",
    icon: "VW",
    color: COLORS[1],
    traderType: "日内均值回归交易者",
    technicalRoute: "VWAP、标准差通道",
    coverPrompt:
      "Gold price oscillating around a central VWAP line with standard-deviation bands, London daylight tones.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-balance", "市场处于平衡或区间状态"),
        rule("ctx-news", "没有正在发布的重大数据"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-band", "价格触及 VWAP 外侧标准差带", true),
        rule("entry-reject", "出现向 VWAP 回归的拒绝 K 线", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-expand", "价格沿通道继续扩张则退出", true),
        rule("risk-stop", "止损位于拒绝结构外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-vwap", "第一目标 VWAP"),
        rule("exit-opposite", "第二目标为反向标准差带"),
      ]),
    ],
  }),
  preset({
    id: "ema-trend-pullback",
    name: "EMA Trend Pullback",
    description: "在均线趋势明确时，等待回踩后顺势恢复。",
    icon: "EM",
    color: COLORS[0],
    traderType: "趋势跟随日内交易者",
    technicalRoute: "EMA、趋势回踩",
    coverPrompt: "Two glowing moving-average lines and a gold candle pulling back before trend continuation.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-order", "20 EMA 与 50 EMA 排列方向一致", true),
        rule("ctx-slope", "均线斜率没有明显走平"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-pullback", "价格回踩 20 或 50 EMA", true),
        rule("entry-confirm", "出现顺势反转 K 线", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-break", "收盘跌破趋势 EMA 并破坏结构"),
        rule("risk-atr", "止损距离不高于当前 ATR 的 1.5 倍"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-swing", "目标前一摆动高低点"),
        rule("exit-trail", "趋势延续后使用 ATR 移动保护"),
      ]),
    ],
  }),
  preset({
    id: "donchian-breakout",
    name: "Donchian Channel Breakout",
    description: "系统化交易 N 周期通道突破，保留趋势尾部。",
    icon: "DC",
    color: COLORS[3],
    traderType: "系统化趋势交易者",
    technicalRoute: "Donchian、通道突破",
    coverPrompt:
      "Transparent Donchian channel with gold price breaking above the upper band, geometric financial design.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-trend", "市场处于趋势或波动扩张阶段"),
        rule("ctx-no-range", "最近通道宽度没有持续收窄"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-high", "收盘突破 N 周期最高价则做多", true),
        rule("entry-low", "收盘跌破 N 周期最低价则做空", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-atr", "止损距离由 ATR 倍数确定", true),
        rule("risk-mid", "价格重回通道中值后重新评估"),
      ]),
      group("exit", "Exit & management", [rule("exit-scale", "分批止盈"), rule("exit-tail", "保留小仓位捕捉趋势尾部")]),
    ],
  }),
  preset({
    id: "bollinger-squeeze",
    name: "Bollinger Squeeze Expansion",
    description: "布林带压缩后突破，交易低波动到高波动的切换。",
    icon: "BS",
    color: COLORS[5],
    traderType: "波动率交易者",
    technicalRoute: "布林带压缩、突破",
    coverPrompt: "A narrow gold volatility channel suddenly expanding into a breakout, dark glass and metallic detail.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-squeeze", "布林带带宽低于近期均值", true),
        rule("ctx-volume", "突破前成交量没有异常失控"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-outside", "价格突破布林带外侧", true),
        rule("entry-expand", "带宽开始扩张", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-return", "快速回到带内且带宽再次收缩"),
        rule("risk-stop", "止损放在压缩区间对侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-atr", "第一目标为 ATR 固定倍数"),
        rule("exit-track", "剩余仓位使用结构跟踪"),
      ]),
    ],
  }),
  preset({
    id: "atr-compression",
    name: "ATR Compression Breakout",
    description: "ATR 压缩后的系统化突破，适合规则驱动交易。",
    icon: "AT",
    color: COLORS[2],
    traderType: "量化与系统交易者",
    technicalRoute: "ATR、波动率压缩",
    coverPrompt: "ATR waveform compressing before a gold breakout, data grid and restrained gold flare.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-compress", "ATR 连续低于历史均值", true),
        rule("ctx-box", "价格形成明确压缩箱体"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-break", "价格突破压缩箱体", true),
        rule("entry-atr", "突破时 ATR 同步上升", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-atr-fall", "ATR 回落且价格收回箱体"),
        rule("risk-stop", "止损位于箱体对侧"),
      ]),
      group("exit", "Exit & management", [rule("exit-r1", "1R 减仓"), rule("exit-r3", "剩余仓位按 2R 和 3R 分批退出")]),
    ],
  }),
  preset({
    id: "fvg-continuation",
    name: "Fair Value Gap Continuation",
    description: "回补公允价值缺口后，顺势恢复趋势。",
    icon: "FV",
    color: COLORS[0],
    traderType: "ICT/SMC 交易者",
    technicalRoute: "FVG、结构延续",
    coverPrompt: "Three-candle fair value gap glowing in gold, price returning to the gap before continuation.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-displacement", "趋势中存在明显位移并留下缺口", true),
        rule("ctx-structure", "市场结构仍支持原趋势"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-gap", "价格回补 FVG 但未完全破坏结构", true),
        rule("entry-resume", "出现恢复原趋势的确认"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-fill", "缺口完全被吃掉并形成反向结构", true),
        rule("risk-stop", "止损位于 FVG 外侧"),
      ]),
      group("exit", "Exit & management", [rule("exit-swing", "目标前高或前低"), rule("exit-rr", "风险回报至少 1.5R")]),
    ],
  }),
  preset({
    id: "order-block-retest",
    name: "Order Block Retest",
    description: "价格回到机构式订单块后，等待结构确认并顺势参与。",
    icon: "OB",
    color: COLORS[5],
    traderType: "订单流与机构结构交易者",
    technicalRoute: "订单块、失衡",
    coverPrompt: "Institutional order block under a gold price retest, clean order-flow lines and glass panels.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-displacement", "订单块离开前出现有力位移", true),
        rule("ctx-clean", "订单块结构清晰且未被反复破坏"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-retest", "价格回到订单块区域", true),
        rule("entry-reject", "出现拒绝或反转确认", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-penetrate", "订单块被有力穿透并收盘在外侧"),
        rule("risk-stop", "止损放在订单块外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-swing", "目标前一摆动点"),
        rule("exit-partial", "到达 1R 后保护剩余仓位"),
      ]),
    ],
  }),
  preset({
    id: "supply-demand-reversal",
    name: "Supply & Demand Zone Reversal",
    description: "在高质量供需区域等待反转确认。",
    icon: "SD",
    color: COLORS[1],
    traderType: "价格行为与供需交易者",
    technicalRoute: "供需区域、基础突破",
    coverPrompt: "Gold price between a red supply zone and a green demand zone, premium editorial trading visual.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-quality", "区域离开前出现快速且有力的价格移动", true),
        rule("ctx-fresh", "区域尚未被多次测试"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-retest", "价格回测供需区域", true),
        rule("entry-reversal", "出现吞没、针形或结构反转", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-break", "连续两根 K 线收盘破坏区域"),
        rule("risk-stop", "止损放在区域外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-mid", "第一目标为区域中值"),
        rule("exit-opposite", "第二目标为对侧结构"),
      ]),
    ],
  }),
  preset({
    id: "failed-breakout-reversion",
    name: "Failed Breakout Reversion",
    description: "捕捉假突破后回到区间或反向运动。",
    icon: "FB",
    color: COLORS[2],
    traderType: "假突破与反转型交易者",
    technicalRoute: "失败突破、流动性陷阱",
    coverPrompt: "A breakout arrow folding back below resistance, gold price forming a V-shaped reversal.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-level", "价格突破关键水平但没有延续", true),
        rule("ctx-trap", "突破后成交量或动能快速衰减"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-reclaim", "价格重新收回关键水平", true),
        rule("entry-confirm", "跌破突破 K 线低点或突破高点确认"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-accept", "价格再次突破并站稳关键位"),
        rule("risk-stop", "止损位于假突破极值外侧"),
      ]),
      group("exit", "Exit & management", [rule("exit-mid", "目标区间中值"), rule("exit-boundary", "第二目标区间对侧")]),
    ],
  }),
  preset({
    id: "round-number-reaction",
    name: "Round Number Reaction",
    description: "利用黄金整数关口的心理支撑阻力反应。",
    icon: "RN",
    color: COLORS[4],
    traderType: "短线与心理价位交易者",
    technicalRoute: "整数关口、心理阻力",
    coverPrompt:
      "A polished gold price meeting a monumental round-number wall, financial psychological-level metaphor.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-level", "价格接近关键整数关口", true),
        rule("ctx-test", "该关口具有明显历史反应"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-reject", "整数位出现拒绝或假突破", true),
        rule("entry-confirm", "出现短周期结构反转"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-accept", "价格有效突破并接受整数位"),
        rule("risk-stop", "止损位于整数位外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-5", "第一目标为最近 5 美元区间"),
        rule("exit-10", "第二目标为最近 10 美元区间"),
      ]),
    ],
  }),
  preset({
    id: "fibonacci-pullback",
    name: "Fibonacci Pullback Continuation",
    description: "趋势推动后回调至黄金分割区，顺势继续。",
    icon: "FI",
    color: COLORS[0],
    traderType: "技术分析与波段交易者",
    technicalRoute: "斐波那契回撤",
    coverPrompt: "Gold Fibonacci grid with a clean 61.8 percent pullback and continuation into extension levels.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-impulse", "趋势推动段清晰", true),
        rule("ctx-align", "更高周期方向与交易方向一致"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-fib", "价格回撤至 50%-61.8% 区间", true),
        rule("entry-confirm", "出现顺势反转确认"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-786", "回撤超过 78.6% 或结构破坏"),
        rule("risk-stop", "止损放在回撤结构外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-1272", "第一目标 1.272 扩展"),
        rule("exit-1618", "第二目标 1.618 扩展"),
      ]),
    ],
  }),
  preset({
    id: "rsi-divergence",
    name: "RSI Divergence Reversal",
    description: "价格与 RSI 动量背离后的反转机会。",
    icon: "RS",
    color: COLORS[5],
    traderType: "震荡与反转交易者",
    technicalRoute: "RSI、动量背离",
    coverPrompt: "Gold price and RSI lines diverging, dual-track financial visualization in gold and violet.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-divergence", "价格创新高但 RSI 未同步", true),
        rule("ctx-divergence-low", "价格创新低但 RSI 未同步"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-structure", "背离后出现结构反转 K 线", true),
        rule("entry-rsi", "RSI 回到中轴或反向突破"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-continuation", "价格继续顺势推进且 RSI 重新扩张"),
        rule("risk-stop", "止损放在背离极值外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-swing", "第一目标最近摆动点"),
        rule("exit-trail", "动量恢复后使用结构移动保护"),
      ]),
    ],
  }),
  preset({
    id: "macd-trend-confirmation",
    name: "MACD Trend Confirmation",
    description: "MACD 方向与趋势一致时，捕捉回踩后的动量恢复。",
    icon: "MC",
    color: COLORS[3],
    traderType: "趋势与动量交易者",
    technicalRoute: "MACD、趋势确认",
    coverPrompt: "MACD histogram strengthening under a gold trend line, dark professional market terminal.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-zero", "MACD 位于零轴正确一侧", true),
        rule("ctx-trend", "价格维持趋势结构"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-histogram", "回踩后 MACD 柱状动能重新增强", true),
        rule("entry-price", "价格恢复趋势方向"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-cross", "MACD 交叉失败并跌破关键结构"),
        rule("risk-stop", "止损位于回踩结构外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-structure", "按结构退出"),
        rule("exit-trail", "趋势段内逐步移动保护"),
      ]),
    ],
  }),
  preset({
    id: "ichimoku-cloud-trend",
    name: "Ichimoku Cloud Trend",
    description: "一目均衡表趋势过滤和云层回踩。",
    icon: "IC",
    color: COLORS[1],
    traderType: "波段趋势交易者",
    technicalRoute: "一目均衡表",
    coverPrompt: "Japanese Ichimoku cloud with gold price crossing above the cloud, refined macro trading aesthetic.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-cloud", "价格位于云层正确一侧", true),
        rule("ctx-lines", "转换线与基准线方向一致"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-retest", "价格回踩云层或基准线", true),
        rule("entry-resume", "重新顺势并保持云层方向", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-break", "价格进入云层并反向突破"),
        rule("risk-stop", "止损位于云层外侧"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-swing", "目标前高或前低"),
        rule("exit-baseline", "跌破基准线后退出"),
      ]),
    ],
  }),
  preset({
    id: "inside-bar-nr7",
    name: "Inside Bar / NR7 Breakout",
    description: "波动压缩后的内包线或 NR7 突破。",
    icon: "IB",
    color: COLORS[4],
    traderType: "价格行为与系统交易者",
    technicalRoute: "内包线、NR7、波动收缩",
    coverPrompt: "Inside-bar mother candle and NR7 compression box with a clean gold breakout arrow.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-inside", "前一根 K 线形成内包线", true),
        rule("ctx-nr7", "或形成七日最窄区间"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-high", "突破母 K 线高点", true),
        rule("entry-low", "跌破母 K 线低点", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-mid", "回到母 K 线中点后降低预期"),
        rule("risk-stop", "止损位于母 K 线对侧"),
      ]),
      group("exit", "Exit & management", [rule("exit-r1", "1R 减仓"), rule("exit-r2", "2R 完成主要退出")]),
    ],
  }),
  preset({
    id: "nfp-cpi-breakout",
    name: "NFP / CPI Volatility Breakout",
    description: "美国宏观数据公布后的波动率突破。",
    icon: "NF",
    color: COLORS[2],
    traderType: "新闻事件交易者",
    technicalRoute: "宏观数据、波动率突破",
    coverPrompt: "US macro calendar pulses and a gold volatility breakout, no readable text, premium newsroom style.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-event", "确认 NFP、CPI 或利率决议时间", true),
        rule("ctx-spread", "点差和滑点处于可接受范围"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-settle", "等待首次波动收敛"),
        rule("entry-break", "突破事件初始区间", true),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-double", "双向假突破后取消交易", true),
        rule("risk-size", "按扩大后的波动缩减仓位"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-fast", "快速锁定第一段利润"),
        rule("exit-news", "新闻影响减弱后退出剩余仓位"),
      ]),
    ],
  }),
  preset({
    id: "dxy-us10y-correlation",
    name: "DXY & US10Y Gold Correlation",
    description: "结合美元指数和美债收益率为黄金提供宏观方向。",
    icon: "DX",
    color: COLORS[5],
    traderType: "宏观与跨市场交易者",
    technicalRoute: "美元指数、美债收益率、相关性",
    coverPrompt: "Three intertwined curves for DXY, US10Y yield, and gold, refined macro correlation visualization.",
    groups: [
      group("ctx", "Market context", [
        rule("ctx-dxy", "DXY 出现关键方向变化", true),
        rule("ctx-yield", "美债收益率与黄金关系没有明显失效"),
      ]),
      group("entry", "Entry criteria", [
        rule("entry-cross", "跨市场驱动与黄金结构方向一致", true),
        rule("entry-gold", "黄金完成结构突破或回踩确认"),
      ]),
      group("risk", "Risk & invalidation", [
        rule("risk-divergence", "跨市场关系失效时提前退出"),
        rule("risk-stop", "主要止损仍按黄金结构设置"),
      ]),
      group("exit", "Exit & management", [
        rule("exit-gold", "以黄金结构为主要退出依据"),
        rule("exit-macro", "宏观背离作为减仓信号"),
      ]),
    ],
  }),
];

const TRADER_TYPE_MATRIX: Record<string, string[]> = {
  "london-opening-range": ["日内突破交易者", "剥头皮", "日内高频执行", "系统化交易者"],
  "ny-open-drive": ["纽约时段交易者", "日内动量交易者", "剥头皮", "日内高频执行"],
  "asian-liquidity-sweep": ["ICT 交易者", "日内反转交易者", "剥头皮", "自由裁量交易者"],
  "london-vwap-reversion": ["日内均值回归交易者", "剥头皮", "日内高频执行", "系统化交易者"],
  "ema-trend-pullback": ["趋势跟随交易者", "日内交易者", "波段交易者", "自由裁量交易者"],
  "donchian-breakout": ["系统化趋势交易者", "量化交易者", "波段交易者", "趋势跟随交易者"],
  "bollinger-squeeze": ["波动率交易者", "日内突破交易者", "系统化交易者", "剥头皮"],
  "atr-compression": ["量化交易者", "系统化交易者", "日内高频执行", "波动率交易者"],
  "fvg-continuation": ["ICT 交易者", "SMC 交易者", "日内趋势交易者", "剥头皮"],
  "order-block-retest": ["订单流交易者", "机构结构交易者", "SMC 交易者", "日内交易者"],
  "supply-demand-reversal": ["价格行为交易者", "供需交易者", "日内反转交易者", "波段交易者"],
  "failed-breakout-reversion": ["假突破交易者", "日内反转交易者", "剥头皮", "自由裁量交易者"],
  "round-number-reaction": ["心理价位交易者", "剥头皮", "日内高频执行", "短线交易者"],
  "fibonacci-pullback": ["技术分析交易者", "波段交易者", "趋势跟随交易者", "自由裁量交易者"],
  "rsi-divergence": ["动量交易者", "反转交易者", "日内交易者", "波段交易者"],
  "macd-trend-confirmation": ["趋势交易者", "动量交易者", "系统化交易者", "日内交易者"],
  "ichimoku-cloud-trend": ["波段趋势交易者", "技术分析交易者", "趋势跟随交易者", "仓位交易者"],
  "inside-bar-nr7": ["价格行为交易者", "系统化交易者", "波动率交易者", "日内高频执行"],
  "nfp-cpi-breakout": ["新闻事件交易者", "宏观交易者", "日内高频执行", "剥头皮"],
  "dxy-us10y-correlation": ["宏观交易者", "跨市场交易者", "波段交易者", "仓位交易者"],
};

const TECHNICAL_DIRECTION_MATRIX: Record<string, string[]> = {
  "london-opening-range": ["breakout", "volatility"],
  "ny-open-drive": ["momentum", "breakout"],
  "asian-liquidity-sweep": ["liquidity", "reversal"],
  "london-vwap-reversion": ["mean_reversion", "indicator"],
  "ema-trend-pullback": ["trend_following", "indicator"],
  "donchian-breakout": ["breakout", "trend_following"],
  "bollinger-squeeze": ["volatility", "breakout"],
  "atr-compression": ["volatility", "breakout"],
  "fvg-continuation": ["liquidity", "price_action"],
  "order-block-retest": ["order_flow", "supply_demand"],
  "supply-demand-reversal": ["supply_demand", "reversal"],
  "failed-breakout-reversion": ["reversal", "liquidity"],
  "round-number-reaction": ["price_action", "reversal"],
  "fibonacci-pullback": ["trend_following", "indicator"],
  "rsi-divergence": ["reversal", "momentum", "indicator"],
  "macd-trend-confirmation": ["trend_following", "momentum", "indicator"],
  "ichimoku-cloud-trend": ["trend_following", "indicator"],
  "inside-bar-nr7": ["price_action", "volatility", "breakout"],
  "nfp-cpi-breakout": ["event_driven", "volatility", "breakout"],
  "dxy-us10y-correlation": ["correlation", "event_driven"],
};

const MARKET_TYPE_MATRIX: Record<string, string[]> = Object.fromEntries(
  Object.keys(TRADER_TYPE_MATRIX).map((id) => [id, ["spot_gold", "precious_metals", "forex"]]),
);

export const GOLD_STRATEGY_PRESETS: GoldStrategyPreset[] = RAW_GOLD_STRATEGY_PRESETS.map((strategy) => ({
  ...strategy,
  traderTypes: TRADER_TYPE_MATRIX[strategy.id.replace(/^gold-/, "")] ?? [strategy.traderType],
  tags: {
    traderTypes: TRADER_TYPE_MATRIX[strategy.id.replace(/^gold-/, "")] ?? [],
    technicalDirections: TECHNICAL_DIRECTION_MATRIX[strategy.id.replace(/^gold-/, "")] ?? [],
    marketTypes: MARKET_TYPE_MATRIX[strategy.id.replace(/^gold-/, "")] ?? ["spot_gold"],
  },
}));

export function createGoldStrategySeeds(): StrategyMock[] {
  return GOLD_STRATEGY_PRESETS.map(({ traderType, traderTypes, technicalRoute, coverPrompt, ...strategy }) => ({
    ...strategy,
    notes: [
      `Primary trader type: ${traderType}`,
      `Trader types: ${traderTypes.join(", ")}`,
      `Technical route: ${technicalRoute}`,
      `Cover prompt: ${coverPrompt}`,
    ].join("\n"),
  }));
}
