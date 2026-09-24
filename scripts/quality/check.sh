#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"${ROOT_DIR}/scripts/quality/static.sh"
if [[ "${SKIP_E2E:-0}" == "1" ]]; then
  echo "[quality] E2E NOT RUN (SKIP_E2E=1); this is not a complete gate"
else
  "${ROOT_DIR}/scripts/quality/e2e.sh"
fi
