#!/usr/bin/env bash
# 独立研究浏览器：前台启动，会话保持期间窗口持续存在
set -euo pipefail
PROFILE_DIR="${TRADEZ_RESEARCH_PROFILE:-$HOME/.tradeez-research-chrome}"
PORT="${TRADEZ_RESEARCH_PORT:-9333}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$PROFILE_DIR"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用；请复用现有研究浏览器或更换 TRADEZ_RESEARCH_PORT。" >&2
  exit 1
fi
echo "研究浏览器启动中，请在窗口完成登录，登录后保持窗口打开。"
exec "$CHROME" \
  --user-data-dir="$PROFILE_DIR" \
  --remote-debugging-port="$PORT" \
  --no-first-run --no-default-browser-check \
  --disable-background-networking --disable-component-update --disable-sync \
  --new-window "https://app.tradezella.com/auth/login"
