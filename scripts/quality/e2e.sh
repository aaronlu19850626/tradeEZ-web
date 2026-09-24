#!/usr/bin/env bash
# Run against owned local services and a disposable, explicitly named database.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-${ROOT_DIR}/backend/.venv/bin/python}"
if [[ "$PYTHON_BIN" != */* ]]; then
  PYTHON_BIN="$(command -v "$PYTHON_BIN" || true)"
fi
export TRADEEZ_BASE_URL="${TRADEEZ_BASE_URL:-http://127.0.0.1:${TRADEEZ_FRONTEND_PORT:-3311}}"
export TRADEEZ_API_URL="${TRADEEZ_API_URL:-http://127.0.0.1:${TRADEEZ_BACKEND_PORT:-8311}/api/v1/}"
: "${TRADEEZ_E2E_DATABASE_URL:?Set a new dedicated tradeez_e2e_* database URL}"
if [[ -z "$PYTHON_BIN" || ! -x "$PYTHON_BIN" ]]; then echo "Missing executable PYTHON_BIN" >&2; exit 1; fi
cd "$ROOT_DIR"
"$PYTHON_BIN" - <<'PY'
import os, socket
from urllib.parse import urlsplit
for key in ('TRADEEZ_BASE_URL', 'TRADEEZ_API_URL'):
    url = urlsplit(os.environ[key])
    if url.scheme != 'http' or url.hostname != '127.0.0.1' or not url.port:
        raise SystemExit(f'{key} must be http://127.0.0.1:<explicit port>')
    if key == 'TRADEEZ_BASE_URL' and url.path not in ('', '/'):
        raise SystemExit('TRADEEZ_BASE_URL must be an origin')
    if key == 'TRADEEZ_API_URL' and url.path != '/api/v1/':
        raise SystemExit('TRADEEZ_API_URL must end with /api/v1/')
    with socket.socket() as sock:
        try:
            sock.bind((url.hostname, url.port))
        except OSError:
            raise SystemExit(f'{key} port is occupied; choose another port')
if urlsplit(os.environ['TRADEEZ_BASE_URL']).port == urlsplit(os.environ['TRADEEZ_API_URL']).port:
    raise SystemExit('Frontend and backend must use different ports')
PY
FRONTEND_PORT="$("$PYTHON_BIN" -c 'import os,urllib.parse; print(urllib.parse.urlsplit(os.environ["TRADEEZ_BASE_URL"]).port)')"
BACKEND_PORT="$("$PYTHON_BIN" -c 'import os,urllib.parse; print(urllib.parse.urlsplit(os.environ["TRADEEZ_API_URL"]).port)')"
export TRADESYNC_DATABASE_URL="$TRADEEZ_E2E_DATABASE_URL"
export TRADESYNC_ENVIRONMENT=test TRADESYNC_AUTH_TEST_MODE=true TRADESYNC_EMAIL_PROVIDER=console TRADESYNC_SMS_PROVIDER=disabled
export TRADESYNC_AUTH_SECRET=e2e-only-auth TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET=e2e-only-encryption TRADESYNC_DEV_FIXED_LOGIN_CODE=""
export TRADESYNC_INTERNAL_API_TOKEN="" TRADESYNC_HEARTBEAT_HISTORY_AUTO_PRUNE=false
export NEXT_PUBLIC_API_BASE_URL="${TRADEEZ_API_URL%/}" NEXT_PUBLIC_EA_API_BASE_URL="${TRADEEZ_API_URL%/}"
export PLAYWRIGHT_AUTH_STATE=".playwright/e2e-${FRONTEND_PORT}.json"
mkdir -p .quality
"$PYTHON_BIN" backend/scripts/seed_e2e.py
BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
  if [[ -n "$FRONTEND_PID" ]]; then kill "$FRONTEND_PID" 2>/dev/null || true; wait "$FRONTEND_PID" 2>/dev/null || true; fi
  if [[ -n "$BACKEND_PID" ]]; then kill "$BACKEND_PID" 2>/dev/null || true; wait "$BACKEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
(cd backend && exec "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT") > .quality/backend.log 2>&1 &
BACKEND_PID=$!
(cd frontend && exec node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port "$FRONTEND_PORT") > .quality/frontend.log 2>&1 &
FRONTEND_PID=$!
wait_ready() {
  local endpoint="$1" child_pid="$2"
  for ((attempt=0; attempt<90; attempt++)); do
    if ! kill -0 "$child_pid" 2>/dev/null; then echo "Service exited; inspect .quality logs" >&2; return 1; fi
    if curl -fsS --max-time 2 "$endpoint" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Service readiness timed out; inspect .quality logs" >&2
  return 1
}
wait_ready "${TRADEEZ_API_URL%/api/v1/}/readyz" "$BACKEND_PID"
wait_ready "$TRADEEZ_BASE_URL/auth/v2/login" "$FRONTEND_PID"
(cd frontend && npx --no-install playwright test "$@")
