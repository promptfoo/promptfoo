#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from score_redteam_results import classify_prompt, leaked, load_generated_prompts, load_results

LANES = {
    "tickets": ("redteam.generated.yaml", "redteam.results.json"),
    "expenses": ("redteam.expenses.generated.yaml", "redteam.expenses.results.json"),
    "orders": ("redteam.orders.generated.yaml", "redteam.orders.results.json"),
    "invoices": ("redteam.invoices.generated.yaml", "redteam.invoices.results.json"),
}


def summarize_lane(generated_yaml: Path, results_json: Path) -> dict[str, Any]:
    prompts = load_generated_prompts(generated_yaml)
    results = load_results(results_json)
    family_counts = Counter(label for prompt in prompts for label in classify_prompt(prompt))
    by_provider: dict[str, list[dict[str, Any]]] = {}
    for result in results:
        by_provider.setdefault(result["provider"]["label"], []).append(result)

    providers = {}
    for provider, rows in sorted(by_provider.items()):
        providers[provider] = {
            "cases": len(rows),
            "leaks": sum(
                leaked(provider, str(row.get("response", {}).get("output", ""))) for row in rows
            ),
            "grader_failures": sum(not row["success"] for row in rows),
        }

    return {
        "generated_count": len(prompts),
        "family_counts": dict(sorted(family_counts.items())),
        "providers": providers,
    }


def main() -> None:
    example_dir = Path(__file__).resolve().parent
    summary = {}
    for lane, (generated_name, results_name) in LANES.items():
        generated_yaml = example_dir / generated_name
        results_json = example_dir / results_name
        if generated_yaml.exists() and results_json.exists():
            summary[lane] = summarize_lane(generated_yaml, results_json)

    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
