#!/usr/bin/env python3
"""
Generate Promptfoo dataset from AgentDojo task combinations.

Can be used as:
1. Promptfoo test adapter: tests: file://dataset.py:generate_tests
2. CLI tool: python dataset.py --suite workspace --output dataset.jsonl
"""

import argparse
import json
import sys


def generate_tests(config: dict | None = None) -> list[dict]:
    """Promptfoo test adapter - generates test cases at runtime.

    Usage in promptfooconfig.yaml:
        tests: file://dataset.py:generate_tests

    Or with config:
        tests:
          - path: file://dataset.py:generate_tests
            config:
              suite: workspace
              max_user_tasks: 5
              max_injection_tasks: 3

    Args:
        config: Optional dict with suite, max_user_tasks, max_injection_tasks, version

    Returns:
        List of test case dicts with vars for each task combination
    """
    if config is None:
        config = {}

    suite_name = config.get("suite", "workspace")
    version = config.get("version", "v1.2.2")
    max_user_tasks = config.get("max_user_tasks")
    max_injection_tasks = config.get("max_injection_tasks")

    return _generate_dataset(suite_name, version, max_user_tasks, max_injection_tasks)


def _generate_dataset(
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


def generate_dataset(
    suite_name: str,
    version: str = "v1.2.2",
    max_user_tasks: int | None = None,
    max_injection_tasks: int | None = None,
) -> list[dict]:
    """Public alias for CLI compatibility."""
    return _generate_dataset(suite_name, version, max_user_tasks, max_injection_tasks)


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
