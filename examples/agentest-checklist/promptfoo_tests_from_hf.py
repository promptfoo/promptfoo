"""Convert the agentest checklist examples CSV on Hugging Face into a promptfoo tests file.

Stdlib only. Promptfoo is not an agentest dependency.

Usage:
    python promptfoo_tests_from_hf.py [limit]

Writes tests.json in the current directory. Assertions are llm-rubric and need a
grader model. For an offline smoke run, use the committed tests.smoke.json with
promptfooconfig.smoke.yaml.
"""

import csv
import io
import json
import sys
import urllib.request

URL = (
    "https://huggingface.co/datasets/srinivaspadmanabhuni/agentic-ai-test-checklist-110"
    "/resolve/f1e49d3da081c6b8411390efd738e41ca355517a/examples/examples-v1.3.0.csv"
)


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    with urllib.request.urlopen(URL, timeout=60) as response:
        text = response.read().decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(text)))
    if limit is not None:
        rows = rows[:limit]
    tests = [
        {
            "description": f"{row['example_id']} {row['title']}",
            "vars": {"scenario": row["scenario"], "input": row["input"]},
            "assert": [{"type": "llm-rubric", "value": row["expected_behavior"]}],
            "metadata": {"test_id": row["test_id"], "severity": row["severity"]},
        }
        for row in rows
    ]
    with open("tests.json", "w", encoding="utf-8") as handle:
        json.dump(tests, handle, indent=1)
        handle.write("\n")
    print(f"wrote {len(tests)} tests to tests.json")


if __name__ == "__main__":
    main()
