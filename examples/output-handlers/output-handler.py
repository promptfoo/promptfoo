"""
Example Python output handler for promptfoo evaluation results.
This demonstrates processing evaluation results in Python.
"""

import json
from datetime import datetime


def handle_output(data):
    """Process evaluation results and generate custom reports."""
    print("\n=== Python Evaluation Results Handler ===")
    print(f"Eval ID: {data['evalId']}")
    print(f"Timestamp: {datetime.now().isoformat()}")

    stats = data["results"]["stats"]
    success_rate = (
        (stats["successes"] / stats["total"] * 100) if stats["total"] > 0 else 0
    )

    print(
        f"\nOverall Results: {stats['successes']}/{stats['total']} passed ({success_rate:.2f}%)"
    )
    print(f"Failures: {stats['failures']}")
    print(f"Tokens used: {stats['tokenUsage']['total']}")

    # Check for failures
    if stats["failures"] > 0:
        print("\n⚠️  Failures detected:")

        for idx, result in enumerate(data["results"]["results"]):
            if not result["success"]:
                print(f"\n  Test {idx + 1}:")
                print(f"    Prompt: {result['prompt']['raw']}")
                print(f"    Variables: {json.dumps(result['vars'])}")
                error_msg = result.get("error", "Assertion failed")
                print(f"    Reason: {error_msg}")

    # Example: Export to CSV
    # import csv
    # with open('results.csv', 'w') as f:
    #     writer = csv.writer(f)
    #     writer.writerow(['Test', 'Success', 'Prompt', 'Variables'])
    #     for idx, result in enumerate(data['results']['results']):
    #         writer.writerow([
    #             idx + 1,
    #             result['success'],
    #             result['prompt']['raw'],
    #             json.dumps(result['vars'])
    #         ])

    # Example: Send to webhook
    # import requests
    # webhook_data = {
    #     'evalId': data['evalId'],
    #     'successRate': success_rate,
    #     'failures': stats['failures']
    # }
    # requests.post('https://example.com/webhook', json=webhook_data)

    # Create summary
    summary = {
        "evalId": data["evalId"],
        "timestamp": datetime.now().isoformat(),
        "successRate": round(success_rate, 2),
        "totalTests": stats["total"],
        "failures": stats["failures"],
        "tokenUsage": stats["tokenUsage"]["total"],
    }

    print(f"\n📊 Summary: {json.dumps(summary, indent=2)}")

    return summary


# Alternative function with different processing
def process_for_dashboard(data):
    """Process results specifically for dashboard display."""
    results = []
    for result in data["results"]["results"]:
        results.append(
            {
                "success": result["success"],
                "topic": result["vars"].get("topic", "unknown"),
                "response": result.get("response", {}).get("output")
                if result["success"]
                else None,
                "latency": result["latencyMs"],
            }
        )

    results_list = data["results"]["results"]
    avg_latency = (
        sum(r["latencyMs"] for r in results_list) / len(results_list)
        if results_list
        else 0
    )

    return {"evalId": data["evalId"], "results": results, "avgLatency": avg_latency}
