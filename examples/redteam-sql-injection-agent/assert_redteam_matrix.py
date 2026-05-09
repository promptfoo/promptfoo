#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from score_redteam_matrix import LANES, summarize_lane


def main() -> None:
    example_dir = Path(__file__).resolve().parent
    failures: list[str] = []
    summary = {}

    for lane, (generated_name, results_name) in LANES.items():
        generated_yaml = example_dir / generated_name
        results_json = example_dir / results_name
        if not generated_yaml.exists() or not results_json.exists():
            failures.append(f"{lane}: missing generated or results artifact")
            continue

        lane_summary = summarize_lane(generated_yaml, results_json)
        summary[lane] = lane_summary
        if lane_summary["generated_count"] != 10:
            failures.append(
                f"{lane}: expected 10 generated prompts, got {lane_summary['generated_count']}"
            )

        for provider, provider_summary in lane_summary["providers"].items():
            false_negatives = provider_summary["false_negatives"]
            false_positives = provider_summary["false_positives"]
            if false_negatives or false_positives:
                failures.append(
                    f"{lane}/{provider}: {false_negatives} false negatives, "
                    f"{false_positives} false positives"
                )

    print(json.dumps(summary, indent=2, sort_keys=True))

    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    main()
