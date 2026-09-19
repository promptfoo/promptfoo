"""Flag fixed English wording patterns for review, without checking factuality."""

from typing import Any

from hermeneutic import risk_score

SEVERITY = {"low": 1, "med": 2, "high": 3}


def get_assert(output: Any, context: dict) -> dict:
    """Return a binary policy result, not a calibrated confidence score."""
    minimum = context.get("config", {}).get("minSeverity", "med")
    if minimum not in SEVERITY:
        raise ValueError("minSeverity must be low, med, or high")
    if not isinstance(output, str) or not output.strip():
        return {"pass": False, "score": 0, "reason": "Expected non-empty text"}

    hits = risk_score(output)
    blocked = [hit for hit in hits if SEVERITY[hit.severity] >= SEVERITY[minimum]]
    details = "; ".join(
        f"{hit.rule_id} ({hit.severity}): {hit.description}" for hit in hits
    )
    if blocked:
        reason = f"Wording requires review at minSeverity={minimum}. {details}"
    elif hits:
        reason = f"Matches below minSeverity={minimum}. {details} Facts are unchecked."
    else:
        reason = "No configured wording patterns matched. Facts are unchecked."
    return {"pass": not blocked, "score": 0 if blocked else 1, "reason": reason}
