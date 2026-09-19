"""Check PostgreSQL connectivity, revision and foreign-key consistency."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
load_dotenv(BACKEND_ROOT / ".env", override=False)

from app.maintenance import check_database


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="PostgreSQL URL; defaults to TRADESYNC_DATABASE_URL")
    parser.add_argument("--quick", action="store_true", help="skip foreign-key consistency checks")
    args = parser.parse_args()
    report = check_database(args.url, quick=args.quick)
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    raise SystemExit(0 if report["ok"] else 1)
