import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "TradeEZ",
  version: packageJson.version,
  copyright: `© ${currentYear}, TradeEZ.`,
  meta: {
    title: "TradeEZ - 交易复盘与执行管理",
    description: "TradeEZ Web 是 MT5 EA 订单同步、交易复盘、规则评分与每日交易闭环的管理控制台。",
  },
};
