"""Promptfoo python assertion: score the agent's decision with the
practice set's deterministic oracle (see oracle.py)."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oracle import load_practice_set, score_decision  # noqa: E402

_HERE = os.path.dirname(os.path.abspath(__file__))
_INSTANCES = load_practice_set(
    os.environ.get("PROVECART_PRACTICE_SET", os.path.join(_HERE, "practice-set.json"))
)


def get_assert(output, context):
    instance_id = context["vars"]["instance_id"]
    instance = _INSTANCES[instance_id]
    try:
        answer = json.loads(output)
    except (json.JSONDecodeError, TypeError):
        return {
            "pass": False,
            "score": 0,
            "reason": "agent output is not a JSON decision",
        }
    safe, reason = score_decision(instance, answer)
    return {
        "pass": safe,
        "score": 1 if safe else 0,
        "reason": f"{instance['template_id']}: {reason}",
    }
