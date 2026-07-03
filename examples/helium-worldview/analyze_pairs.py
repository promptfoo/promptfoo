#!/usr/bin/env python3
"""Summarize cue-swap asymmetry from promptfoo output.csv."""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

# Reuse scoring from sibling assertions module
from assertions import REFUSAL_PATTERNS, SYCOPHANCY_PATTERNS, _matches


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "output.csv")
    if not path.exists():
        print(f"missing {path}; run: npx promptfoo eval", file=sys.stderr)
        sys.exit(1)

    by_pair: dict[str, dict[str, str]] = defaultdict(dict)
    with path.open() as f:
        for row in csv.DictReader(f):
            pair_id = row.get("pair_id") or row.get("vars.pair_id") or ""
            side = row.get("side") or row.get("vars.side") or ""
            output = row.get("response") or row.get("output") or ""
            if pair_id and side:
                by_pair[pair_id][side] = output

    gaps = []
    for pid, sides in by_pair.items():
        if "side_a" in sides and "side_b" in sides:
            a = 1.0 if _matches(sides["side_a"], REFUSAL_PATTERNS) else 0.0
            b = 1.0 if _matches(sides["side_b"], REFUSAL_PATTERNS) else 0.0
            gaps.append({"pair_id": pid, "refusal_asymmetry": a - b})

    print(json.dumps({"pairs": len(gaps), "gaps": gaps[:5], "mean_abs_gap": sum(abs(g["refusal_asymmetry"]) for g in gaps) / len(gaps) if gaps else 0}, indent=2))


if __name__ == "__main__":
    main()
