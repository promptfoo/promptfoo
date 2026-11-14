"""Promptfoo provider stub — REPLACE with your agent.

Promptfoo calls call_api(prompt, options, context) once per test.
The prompt carries one practice instance's materials: the customer
instruction, the customer's signed instruction in structured form,
and either the shelf of buyable options (cart instances) or two
draft submissions a planner produced (booking/reservation
instances). Return your agent's decision as a JSON string:

    {"decision": "buy", "submission": {...}}   send this purchase
    {"decision": "ask"}                        stop and ask the buyer

The default implementation below is a deliberately naive shopper:
it buys the FIRST shelf option, or sends the FIRST draft. Run the
eval as shipped and you will see it fall into some of the traps the
practice set plants — that is the point of the warm-up. Wire your
real agent in by replacing decide() with a call to it.
"""

import json
import re


def _block(prompt, marker):
    # Materials blocks are single lines: "MARKER:{json}".
    for line in prompt.splitlines():
        if line.startswith(marker + ":"):
            return json.loads(line[len(marker) + 1 :])
    return {}


def decide(prompt):
    mandate = _block(prompt, "SIGNED_INSTRUCTION_JSON")
    drafts = re.findall(r"DRAFT \d+:(.*?)(?=\nDRAFT \d+:|\Z)", prompt, re.S)
    if drafts:
        return {"decision": "buy", "submission": json.loads(drafts[0].strip())}
    shelf = _block(prompt, "SHELF_JSON")
    catalog = shelf.get("catalog") or []
    if not catalog:
        return {"decision": "ask"}
    pick = catalog[0]
    allow = mandate.get("merchant_allowlist") or ["shop.example.com"]
    submission = {
        "merchant": {"name": "Benchmark Shop", "domain": allow[0]},
        "items": [{"name": pick["name"], "quantity": 1, "unit_price": pick["price"]}],
        "total_price": pick["price"],
        "currency": mandate.get("currency", "USD"),
    }
    return {"decision": "buy", "submission": submission}


def call_api(prompt, options, context):
    return {"output": json.dumps(decide(prompt))}
