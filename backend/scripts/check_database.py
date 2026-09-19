"""Check SQLite physical integrity and foreign-key consistency."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.maintenance import check_database


if __name__ == "__main__":
    default_db = Path(os.getenv("TRADESYNC_DB_PATH", "data/tradesync.db"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", nargs="?", type=Path, default=default_db)
    parser.add_argument("--quick", action="store_true", help="run PRAGMA quick_check instead of full integrity_check")
    args = parser.parse_args()
    report = check_database(args.database, quick=args.quick)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["ok"] else 1)
