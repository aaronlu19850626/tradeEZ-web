#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"

if ! curl -fsS --max-time 5 http://127.0.0.1:8000/readyz >/dev/null; then
  echo "Backend is not ready at http://127.0.0.1:8000" >&2
  exit 1
fi

if ! curl -fsS --max-time 5 http://127.0.0.1:3000 >/dev/null; then
  echo "Frontend is not ready at http://127.0.0.1:3000" >&2
  exit 1
fi

echo "[quality] Playwright browser regression"
(cd "${FRONTEND_DIR}" && npx playwright test)
