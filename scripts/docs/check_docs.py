#!/usr/bin/env python3
"""Validate the current documentation tree without third-party dependencies."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
REQUIRED = {"doc_id", "status", "owner", "last_verified"}
STATUSES = {"active", "needs-review", "paused"}
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def front_matter(text: str) -> dict[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end < 0:
        return None
    values: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def main() -> int:
    errors: list[str] = []
    ids: dict[str, Path] = {}
    markdown = sorted(DOCS.rglob("*.md"))
    for path in markdown:
        relative = path.relative_to(ROOT)
        text = path.read_text(encoding="utf-8")
        meta = front_matter(text)
        if meta is None:
            errors.append(f"{relative}: missing YAML front matter")
        else:
            missing = REQUIRED - meta.keys()
            if missing:
                errors.append(f"{relative}: missing metadata {', '.join(sorted(missing))}")
            if meta.get("status") not in STATUSES:
                errors.append(f"{relative}: invalid status {meta.get('status')!r}")
            doc_id = meta.get("doc_id")
            if doc_id:
                if doc_id in ids:
                    errors.append(f"duplicate doc_id {doc_id}: {ids[doc_id]} and {relative}")
                ids[doc_id] = relative
            if relative.parts[:1] == ("30-模块规格",) and "github_issue:" not in text:
                errors.append(f"{relative}: module spec requires github_issue metadata")
            if "/Users/" in text or "docs/90-历史归档" in text:
                errors.append(f"{relative}: contains local absolute path or removed archive reference")

        for target in LINK_RE.findall(text):
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target_path = target.split("#", 1)[0].split("?", 1)[0]
            if not target_path:
                continue
            resolved = (path.parent / target_path).resolve()
            if not resolved.exists():
                errors.append(f"{relative}: broken link {target}")

    if errors:
        print("Documentation checks failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(f"Documentation checks passed: {len(markdown)} Markdown files, {len(ids)} unique doc IDs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
