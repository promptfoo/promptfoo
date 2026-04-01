"""
Example Python extension hook for processing evaluation results.

Usage:
    promptfoo eval -x file://result-handler.py:after_all

Or in promptfooconfig.yaml:
    extensions:
      - file://result-handler.py:after_all
"""


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
        # Example: send a Slack/webhook notification that includes `eval_id` and
        # `success_rate` so regressions are visible in your team's alerting.

    # Log failures
    if failed > 0:
        print("Failed tests:")
        for i, r in enumerate(results):
            if not r.get("success"):
                error = r.get("error") or "Assertion failed"
                print(f"  {i + 1}. {error}")

    # Example: export `results` to CSV or JSON for durable reporting, keeping
    # fields like `success`, `latencyMs`, and `cost` for downstream analysis.
