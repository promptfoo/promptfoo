#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(sys.argv[1] if len(sys.argv) > 1 else "skill_fixture/repo")
    ticket_path = repo_root / "tickets" / "TICKET-014.md"
    source_path = repo_root / "src" / "discount_policy.py"

    ticket_text = ticket_path.read_text()
    source_text = source_path.read_text()

    if "return discount_percent > 20" not in source_text:
        raise SystemExit("fixture no longer contains the expected boundary bug")

    print(
        json.dumps(
            {
                "ticket_id": "TICKET-014",
                "severity": "high",
                "owner": "platform-integrations",
                "primary_file": "skill_fixture/repo/src/discount_policy.py",
                "minimal_fix": "return discount_percent >= 20",
                "ticket_excerpt": ticket_text.splitlines()[0],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
