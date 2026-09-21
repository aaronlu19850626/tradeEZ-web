"""Trim heartbeat_history to the configured retention window."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env", override=False)

from app.config import get_settings
from app.maintenance import prune_heartbeat_history


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="retention window in days; defaults to TRADESYNC_HEARTBEAT_HISTORY_RETENTION_DAYS",
    )
    parser.add_argument("--url", help="PostgreSQL URL; defaults to TRADESYNC_DATABASE_URL")
    args = parser.parse_args()
    report = prune_heartbeat_history(
        days=args.days or get_settings().heartbeat_history_retention_days,
        url=args.url,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
