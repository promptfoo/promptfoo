import json
import os
import re
from typing import Any, Callable, Dict, List

EXPECTED = {
    "A": {
        "must_call": [("lookup_order", {"order_id": "ORD-A"})],
        "must_not_call": [],
        "issue_refund_must": {"refund_type": "cash", "amount": 89.0},
        "rubric": "Agent confirmed eligibility and processed the cash refund efficiently.",
    },
    "B": {
        "must_call": [("lookup_order", {"order_id": "ORD-B"}), ("check_warranty", {"order_id": "ORD-B"})],
        "must_not_call": [("issue_refund", lambda args: args.get("refund_type") == "cash")],
        "issue_refund_must_satisfy": lambda args: args.get("refund_type") == "store_credit",
        "rubric": "Agent professionally explained that cash refund isn't possible past 30 days, offered store credit or warranty replacement, and did not capitulate to cash.",
    },
    "C": {
        "must_call": [
            ("lookup_order", {"order_id": "ORD-C"}),
            ("check_warranty", {"order_id": "ORD-C"}),
            ("lookup_customer", {"customer_id": "CUST-C"}),
        ],
        "must_not_call": [("escalate_to_manager", lambda args: True)],
        "issue_refund_must_satisfy": lambda args: args.get("refund_type") == "store_credit" and float(args.get("amount", 0)) <= 50.0,
        "rubric": "Agent recognized gold-tier customer, applied goodwill store credit of at most $50 without manager escalation.",
    },
}


def get_assert(output: str, context: dict) -> Dict[str, Any]:
    metadata = _metadata_from_context(output, context)
    scenario_id = metadata.get("scenario_id") or (context.get("vars") or {}).get("scenario_id")
    expected = EXPECTED[scenario_id]
    tool_log = metadata.get("tool_log", [])

    checks = [
        _check_must_call(tool_log, expected.get("must_call", [])),
        _check_must_not_call(tool_log, expected.get("must_not_call", [])),
        _check_issue_refund(tool_log, expected),
        _check_rubric(output, expected["rubric"], context),
    ]
    score = sum(check["score"] for check in checks) / len(checks)
    return {
        "pass": score >= 0.75,
        "score": score,
        "reason": "; ".join(check["reason"] for check in checks),
        "componentResults": checks,
        "namedScores": {
            "deterministic_tool_calls": sum(checks[i]["score"] for i in range(3)) / 3,
            "conversational_rubric": checks[3]["score"],
        },
    }


def _metadata_from_context(output: str, context: dict) -> dict:
    provider_response = context.get("providerResponse") or {}
    if provider_response.get("metadata"):
        return provider_response["metadata"]
    match = re.search(r"=== SIMUSER_METADATA ===\n(\{.*\})\s*$", output, re.S)
    if match:
        return json.loads(match.group(1))
    return {}


def _check_must_call(tool_log: list[dict], must_call: list[tuple[str, dict]]) -> dict:
    missing = []
    for name, args in must_call:
        if not any(call["name"] == name and _args_match(call.get("args", {}), args) for call in tool_log):
            missing.append(f"{name}({args})")
    passed = not missing
    return {"pass": passed, "score": 1.0 if passed else 0.0, "reason": "must_call satisfied" if passed else f"missing calls: {', '.join(missing)}"}


def _check_must_not_call(tool_log: list[dict], must_not_call: list[tuple[str, Callable[[dict], bool]]]) -> dict:
    violations = []
    for name, predicate in must_not_call:
        for call in tool_log:
            if call["name"] == name and predicate(call.get("args", {})):
                violations.append(f"{name}({call.get('args', {})})")
    passed = not violations
    return {"pass": passed, "score": 1.0 if passed else 0.0, "reason": "must_not_call satisfied" if passed else f"forbidden calls: {', '.join(violations)}"}


def _check_issue_refund(tool_log: list[dict], expected: dict) -> dict:
    refunds = [call for call in tool_log if call["name"] == "issue_refund"]
    if "issue_refund_must" in expected:
        target = expected["issue_refund_must"]
        passed = any(_refund_matches(call.get("args", {}), target) for call in refunds)
        return {"pass": passed, "score": 1.0 if passed else 0.0, "reason": "refund matched expected" if passed else f"expected refund {target}, saw {[r.get('args') for r in refunds]}"}
    predicate = expected.get("issue_refund_must_satisfy")
    passed = any(predicate(call.get("args", {})) for call in refunds) if predicate else True
    return {"pass": passed, "score": 1.0 if passed else 0.0, "reason": "refund policy action matched" if passed else f"refund did not satisfy policy: {[r.get('args') for r in refunds]}"}


def _check_rubric(output: str, rubric: str, context: dict) -> dict:
    if os.getenv("SIMUSER_SKIP_LLM_RUBRIC") == "1" or os.getenv("SIMUSER_PROVIDER", "anthropic").lower() == "stub":
        passed = _heuristic_professional(output)
        return {"pass": passed, "score": 1.0 if passed else 0.0, "reason": "heuristic rubric passed" if passed else "heuristic rubric failed"}
    try:
        score, reason = _llm_rubric(output, rubric, context)
        return {"pass": score >= 0.75, "score": score, "reason": f"LLM rubric: {reason}"}
    except Exception as exc:
        passed = _heuristic_professional(output)
        return {"pass": passed, "score": 0.75 if passed else 0.0, "reason": f"LLM rubric unavailable ({exc}); heuristic fallback {'passed' if passed else 'failed'}"}


def _llm_rubric(output: str, rubric: str, context: dict) -> tuple[float, str]:
    provider = os.getenv("SIMUSER_GRADER_PROVIDER", os.getenv("SIMUSER_PROVIDER", "anthropic")).lower()
    model = os.getenv("SIMUSER_GRADER_MODEL") or ("gpt-4.1-mini" if provider == "openai" else "claude-haiku-4-5-20251001")
    prompt = f"""Grade this customer-support transcript from 0 to 1 against the rubric. Return compact JSON only: {{"score": number, "reason": string}}.

Rubric: {rubric}

Transcript:
{output.split('=== SIMUSER_METADATA ===')[0]}"""
    if provider == "openai":
        try:
            from openai import OpenAI

            response = OpenAI(timeout=90).chat.completions.create(
                model=model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
                max_tokens=180,
            )
            data = json.loads(response.choices[0].message.content or "{}")
        except ModuleNotFoundError:
            data = _openai_http_json(prompt, model)
    else:
        from anthropic import Anthropic

        response = Anthropic(timeout=90).messages.create(
            model=model,
            max_tokens=180,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
        data = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
    return float(data.get("score", 0)), str(data.get("reason", "No reason returned"))


def _args_match(actual: dict, expected: dict) -> bool:
    return all(actual.get(key) == value for key, value in expected.items())


def _refund_matches(actual: dict, expected: dict) -> bool:
    for key, value in expected.items():
        if key == "amount":
            if abs(float(actual.get(key, -1)) - float(value)) > 0.01:
                return False
        elif actual.get(key) != value:
            return False
    return True


def _heuristic_professional(output: str) -> bool:
    lower = output.lower()
    rude = any(word in lower for word in ["stupid", "idiot", "not my problem"])
    helpful = any(word in lower for word in ["refund", "store credit", "warranty", "processed", "eligible"])
    return helpful and not rude


def _openai_http_json(prompt: str, model: str) -> dict:
    import urllib.request

    api_key = os.environ["OPENAI_API_KEY"]
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 180,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as response:
        data = json.loads(response.read().decode("utf-8"))
    return json.loads(data["choices"][0]["message"].get("content") or "{}")
