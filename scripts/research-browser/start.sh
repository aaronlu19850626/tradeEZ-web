#!/usr/bin/env bash
# 独立研究浏览器：专用 Chrome 用户目录 + CDP 调试端口（后台常驻）
set -euo pipefail

PROFILE_DIR="${TRADEZ_RESEARCH_PROFILE:-$HOME/.tradeez-research-chrome}"
PORT="${TRADEZ_RESEARCH_PORT:-9333}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
LOG="$PROFILE_DIR/startup.log"

mkdir -p "$PROFILE_DIR"

# 不结束未知进程；端口占用时由使用者确认是复用还是换端口。
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用；请复用现有研究浏览器或更换 TRADEZ_RESEARCH_PORT。" >&2
  exit 1
fi

nohup "$CHROME" \
  --user-data-dir="$PROFILE_DIR" \
  --remote-debugging-port="$PORT" \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-networking \
  --disable-component-update \
  --disable-sync \
  --new-window \
  "https://app.tradezella.com/auth/login" >"$LOG" 2>&1 &

echo "研究浏览器已后台启动 (port: $PORT, log: $LOG)"
echo "请在窗口中完成 TradeZella 登录，登录后保持窗口打开。"
