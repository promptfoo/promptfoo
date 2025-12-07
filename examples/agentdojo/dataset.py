#!/usr/bin/env python3
"""
Generate Promptfoo dataset from AgentDojo task combinations.

Usage:
    python dataset.py --suite workspace --output dataset.jsonl
    python dataset.py --all-suites --output full_dataset.jsonl
    python dataset.py --suite workspace --max-user-tasks 5 --max-injection-tasks 3
"""

import argparse
import json
import sys


def generate_dataset(
    suite_name: str,
    version: str = "v1.2.2",
    max_user_tasks: int | None = None,
    max_injection_tasks: int | None = None,
) -> list[dict]:
    """Generate dataset rows for a suite."""
    # Import here to allow running --help without agentdojo installed
    from agentdojo.task_suite import get_suite

    suite = get_suite(version, suite_name)

    user_tasks = list(suite.user_tasks.keys())
    injection_tasks = list(suite.injection_tasks.keys())

    if max_user_tasks:
        user_tasks = user_tasks[:max_user_tasks]
    if max_injection_tasks:
        injection_tasks = injection_tasks[:max_injection_tasks]

    rows = []
    for user_task_id in user_tasks:
        for injection_task_id in injection_tasks:
            rows.append(
                {
                    "vars": {
                        "suite": suite_name,
                        "user_task_id": user_task_id,
                        "injection_task_id": injection_task_id,
                    }
                }
            )

    return rows


def get_all_suites(version: str = "v1.2.2") -> list[str]:
    """Get list of all available suite names."""
    from agentdojo.task_suite import get_suites

    return list(get_suites(version).keys())


def main():
    parser = argparse.ArgumentParser(
        description="Generate AgentDojo dataset for Promptfoo evaluation"
    )
    parser.add_argument(
        "--suite",
        default="workspace",
        help="Suite name (workspace, slack, travel, banking)",
    )
    parser.add_argument(
        "--all-suites",
        action="store_true",
        help="Generate for all available suites",
    )
    parser.add_argument(
        "--version",
        default="v1.2.2",
        help="AgentDojo benchmark version (default: v1.2.2)",
    )
    parser.add_argument(
        "--max-user-tasks",
        type=int,
        help="Limit number of user tasks (for quick testing)",
    )
    parser.add_argument(
        "--max-injection-tasks",
        type=int,
        help="Limit number of injection tasks (for quick testing)",
    )
    parser.add_argument(
        "--output",
        default="dataset.jsonl",
        help="Output file path (default: dataset.jsonl)",
    )
    parser.add_argument(
        "--list-suites",
        action="store_true",
        help="List available suites and exit",
    )

    args = parser.parse_args()

    # List suites mode
    if args.list_suites:
        try:
            suites = get_all_suites(args.version)
            print(f"Available suites in {args.version}:")
            for s in suites:
                print(f"  - {s}")
        except ImportError:
            print("Error: agentdojo not installed. Run: pip install agentdojo")
            sys.exit(1)
        return

    # Determine which suites to process
    if args.all_suites:
        try:
            suites = get_all_suites(args.version)
        except ImportError:
            print("Error: agentdojo not installed. Run: pip install agentdojo")
            sys.exit(1)
    else:
        suites = [args.suite]

    # Generate dataset
    all_rows = []
    for suite in suites:
        try:
            rows = generate_dataset(
                suite,
                args.version,
                args.max_user_tasks,
                args.max_injection_tasks,
            )
            all_rows.extend(rows)
            print(f"Generated {len(rows)} test cases for {suite}")
        except Exception as e:
            print(f"Error processing suite {suite}: {e}")
            sys.exit(1)

    # Write output
    with open(args.output, "w") as f:
        for row in all_rows:
            f.write(json.dumps(row) + "\n")

    print(f"\nTotal: {len(all_rows)} test cases written to {args.output}")


if __name__ == "__main__":
    main()
