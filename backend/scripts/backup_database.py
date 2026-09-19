"""Create a consistent PostgreSQL custom-format backup."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
load_dotenv(BACKEND_ROOT / ".env", override=False)

from app.maintenance import backup_database


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="output .dump file; must not already exist")
    parser.add_argument("--url", help="PostgreSQL URL; defaults to TRADESYNC_DATABASE_URL")
    args = parser.parse_args()
    result = backup_database(args.destination, args.url)
    print(f"Backup created: {result['backup']} (database={result['database']})")
