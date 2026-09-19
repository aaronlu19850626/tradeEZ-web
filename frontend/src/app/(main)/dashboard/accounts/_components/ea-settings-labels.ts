// Display metadata from docs/TradeEZ-SOP_数据同步接口说明(1).md. Never rename protocol keys.
export const EA_GROUP_LABELS: Record<string, string> = {
  "basic": "基础设置",
  "risk": "风险控制",
  "scalp": "剥头皮策略",
  "trend": "趋势策略",
  "moat": "利润保护",
  "sync": "数据同步"
};

export const EA_SETTING_LABELS: Record<string, { label: string; parameter: string }> = {
  "basic.magic": {
    "label": "基础魔术号",
    "parameter": "Inp_Magic"
  },
  "basic.magic_scalp": {
    "label": "剥头皮魔术号",
    "parameter": "Inp_MagicScalp"
  },
  "basic.magic_trend": {
    "label": "趋势魔术号",
    "parameter": "Inp_MagicTrend"
  },
  "basic.comment_scalp": {
    "label": "剥头皮备注",
    "parameter": "Inp_CommentScalp"
  },
  "basic.comment_trend": {
    "label": "趋势备注",
    "parameter": "Inp_CommentTrend"
  },
  "basic.slippage": {
    "label": "允许滑点，原生报价点",
    "parameter": "Inp_Slippage"
  },
  "basic.refresh_seconds": {
    "label": "刷新/定时器输入间隔，秒",
    "parameter": "Inp_RefreshSeconds"
  },
  "basic.ui_scale": {
    "label": "界面缩放系数",
    "parameter": "Inp_UIScale"
  },
  "basic.use_session": {
    "label": "交易时段门控开关",
    "parameter": "Inp_UseSession"
  },
  "basic.session_start": {
    "label": "北京时间交易开始小时",
    "parameter": "Inp_SessionStartHour"
  },
  "basic.session_end": {
    "label": "北京时间交易结束小时",
    "parameter": "Inp_SessionEndHour"
  },
  "basic.reset_hour": {
    "label": "北京时间每日初始化小时",
    "parameter": "Inp_ResetHour"
  },
  "basic.reset_minute": {
    "label": "每日初始化分钟",
    "parameter": "Inp_ResetMinute"
  },
  "basic.export_on_reset": {
    "label": "跨日重置前导出开关",
    "parameter": "Inp_ExportOnReset"
  },
  "risk.daily_max_drawdown": {
    "label": "日亏损额度；实际不是峰值回撤",
    "parameter": "Inp_DailyMaxDrawdown"
  },
  "risk.daily_profit_target": {
    "label": "日盈利目标输入",
    "parameter": "Inp_DailyProfitTarget"
  },
  "risk.scalp_drawdown_ratio": {
    "label": "剥头皮亏损额度占比，%",
    "parameter": "Inp_ScalpDrawdownRatio"
  },
  "risk.trend_drawdown_ratio": {
    "label": "趋势亏损额度占比，%",
    "parameter": "Inp_TrendDrawdownRatio"
  },
  "risk.weekly_profit_target": {
    "label": "周盈利目标",
    "parameter": "Inp_WeeklyProfitTarget"
  },
  "risk.consec_loss_limit": {
    "label": "连亏笔数阈值",
    "parameter": "Inp_ConsecLossLimit"
  },
  "risk.cooldown_minutes": {
    "label": "冷却分钟",
    "parameter": "Inp_CooldownMinutes"
  },
  "risk.enable_circuit_breaker": {
    "label": "普通熔断开关",
    "parameter": "Inp_EnableCircuitBreaker"
  },
  "risk.alert_on_breaker": {
    "label": "熔断提示开关",
    "parameter": "Inp_AlertOnBreaker"
  },
  "scalp.lots": {
    "label": "剥头皮手数",
    "parameter": "Inp_ScalpLots"
  },
  "scalp.max_positions": {
    "label": "最大持仓数",
    "parameter": "Inp_ScalpMaxPositions"
  },
  "scalp.sl_points": {
    "label": "初始止损标准点",
    "parameter": "Inp_ScalpSL_Points"
  },
  "scalp.tp_points": {
    "label": "初始止盈标准点",
    "parameter": "Inp_ScalpTP_Points"
  },
  "scalp.be_trigger": {
    "label": "峰值追踪激活标准点",
    "parameter": "Inp_ScalpBETrigger"
  },
  "scalp.trail_step": {
    "label": "峰值允许回撤标准点",
    "parameter": "Inp_ScalpTrailStep"
  },
  "scalp.time_limit_on": {
    "label": "超时强平开关",
    "parameter": "Inp_ScalpTimeLimitOn"
  },
  "scalp.max_hold_secs": {
    "label": "最长持仓秒数",
    "parameter": "Inp_ScalpMaxHoldSecs"
  },
  "trend.lots": {
    "label": "趋势手数",
    "parameter": "Inp_TrendLots"
  },
  "trend.max_positions": {
    "label": "最大持仓数",
    "parameter": "Inp_TrendMaxPositions"
  },
  "trend.sl_points": {
    "label": "初始止损标准点",
    "parameter": "Inp_TrendSL_Points"
  },
  "trend.be1_trigger": {
    "label": "第一档保本触发标准点",
    "parameter": "Inp_TrendBE1_Trigger"
  },
  "trend.be2_trigger": {
    "label": "第二档触发标准点",
    "parameter": "Inp_TrendBE2_Trigger"
  },
  "trend.be2_lock": {
    "label": "第二档锁盈标准点",
    "parameter": "Inp_TrendBE2_Lock"
  },
  "trend.be3_trigger": {
    "label": "第三档锁盈/减仓触发标准点",
    "parameter": "Inp_TrendBE3_Trigger"
  },
  "trend.be3_lock": {
    "label": "第三档锁盈标准点",
    "parameter": "Inp_TrendBE3_Lock"
  },
  "trend.reduce_percent": {
    "label": "减仓比例，%",
    "parameter": "Inp_TrendReducePercent"
  },
  "trend.trail_trigger": {
    "label": "尾随激活标准点",
    "parameter": "Inp_TrendTrailTrigger"
  },
  "trend.trail_step": {
    "label": "峰值回撤标准点",
    "parameter": "Inp_TrendTrailStep"
  },
  "moat.enable": {
    "label": "利润护城河开关",
    "parameter": "Inp_EnableProfitProtect"
  },
  "moat.p1_trigger": {
    "label": "第一档盈利高点触发金额",
    "parameter": "Inp_ProfitProtect1_Trigger"
  },
  "moat.p1_percent": {
    "label": "第一档回撤百分比；默认300实际表示300%",
    "parameter": "Inp_ProfitProtect1_Percent"
  },
  "moat.p2_trigger": {
    "label": "第二档盈利高点触发金额",
    "parameter": "Inp_ProfitProtect2_Trigger"
  },
  "moat.p2_amount": {
    "label": "第二档回撤金额",
    "parameter": "Inp_ProfitProtect2_Amount"
  },
  "moat.liquidation": {
    "label": "命名为清盘阈值，当前达到时锁开仓；不等同立即全平",
    "parameter": "Inp_ProfitLiquidation"
  },
  "moat.shutdown": {
    "label": "盈利停止开仓阈值",
    "parameter": "Inp_ProfitShutdown"
  },
  "sync.enable": {
    "label": "数据同步开关",
    "parameter": "Inp_EnableSync"
  },
  "sync.api_base_url": {
    "label": "接口基础地址",
    "parameter": "Inp_ApiBaseURL"
  },
  "sync.sync_interval_min": {
    "label": "成交同步间隔输入，分钟",
    "parameter": "Inp_SyncIntervalMin"
  },
  "sync.request_timeout_ms": {
    "label": "原始超时输入；实际请求限制为200–800ms",
    "parameter": "Inp_RequestTimeoutMS"
  },
  "sync.max_batch_size": {
    "label": "原始批量输入；实际发送限制为1–1000",
    "parameter": "Inp_MaxBatchSize"
  },
  "sync.debug": {
    "label": "调试日志开关",
    "parameter": "Inp_DebugSync"
  }
};
