#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
PYTHON_BIN="${PYTHON_BIN:-${BACKEND_DIR}/.venv/bin/python}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Backend Python virtualenv not found: ${PYTHON_BIN}" >&2
  exit 1
fi

echo "[quality] backend tests"
(cd "${BACKEND_DIR}" && "${PYTHON_BIN}" -m pytest -q)

echo "[quality] frontend typecheck"
(cd "${FRONTEND_DIR}" && npx tsc --noEmit)

echo "[quality] frontend biome"
(cd "${FRONTEND_DIR}" && npx biome check --diagnostic-level=error --max-diagnostics=300)

echo "[quality] frontend production build"
(cd "${FRONTEND_DIR}" && npm run build)

if [[ "${SKIP_E2E:-0}" == "1" ]]; then
  echo "[quality] Playwright skipped by SKIP_E2E=1"
else
  "${ROOT_DIR}/scripts/quality/e2e.sh"
fi

echo "[quality] all checks passed"
