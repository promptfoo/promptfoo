"""
Example Python extension hook for processing evaluation results.

Usage:
    promptfoo eval -x file://result-handler.py:after_all

Or in promptfooconfig.yaml:
    extensions:
      - file://result-handler.py:after_all
"""

import json


def after_all(context):
    """
    Called after all tests complete.

    Args:
        context: Dictionary with keys:
            - evalId: Unique evaluation ID
            - config: Full evaluation configuration
            - suite: Test suite configuration
            - results: List of all evaluation results
            - prompts: List of completed prompts with metrics
    """
    eval_id = context.get("evalId")
    results = context.get("results", [])

    # Calculate statistics
    total = len(results)
    passed = sum(1 for r in results if r.get("success"))
    failed = total - passed
    success_rate = (passed / total * 100) if total > 0 else 0

    # Calculate costs and latency
    total_cost = sum(r.get("cost", 0) or 0 for r in results)
    avg_latency = (
        sum(r.get("latencyMs", 0) or 0 for r in results) / total if total > 0 else 0
    )

    print("\n" + "=" * 40)
    print("       EVALUATION RESULTS SUMMARY       ")
    print("=" * 40)
    print(f"Eval ID:      {eval_id}")
    print(f"Total Tests:  {total}")
    print(f"Passed:       {passed}")
    print(f"Failed:       {failed}")
    print(f"Success Rate: {success_rate:.1f}%")
    print(f"Total Cost:   ${total_cost:.4f}")
    print(f"Avg Latency:  {avg_latency:.0f}ms")
    print("=" * 40 + "\n")

    # Alert on low success rate
    if success_rate < 80:
        print(f"WARNING: Success rate {success_rate:.1f}% is below 80% threshold!")

        # Example: Send webhook notification
        # import requests
        # requests.post("https://hooks.slack.com/...", json={
        #     "text": f"Evaluation {eval_id} has low success rate: {success_rate:.1f}%"
        # })

    # Log failures
    if failed > 0:
        print("Failed tests:")
        for i, r in enumerate(results):
            if not r.get("success"):
                error = r.get("error") or "Assertion failed"
                print(f"  {i + 1}. {error}")

    # Example: Export to CSV
    # import csv
    # with open(f"results_{eval_id}.csv", "w", newline="") as f:
    #     writer = csv.DictWriter(f, fieldnames=["success", "latencyMs", "cost"])
    #     writer.writeheader()
    #     for r in results:
    #         writer.writerow({
    #             "success": r.get("success"),
    #             "latencyMs": r.get("latencyMs"),
    #             "cost": r.get("cost"),
    #         })
