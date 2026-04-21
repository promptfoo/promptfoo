import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.invoice_agent import invoice_agent  # noqa: E402
from app.routes import INVOICE_SUPPORT_ROUTE  # noqa: E402


def _dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def invoice_agent_provider(prompt: str, options: dict, context: dict) -> dict:
    config = _dict(_dict(options).get("config"))
    vars = _dict(_dict(context).get("vars"))
    safe_defaults = INVOICE_SUPPORT_ROUTE["safe_defaults"]
    user_id = (
        vars.get("user_id") or config.get("defaultUserId") or safe_defaults["user_id"]
    )
    invoice_id = (
        vars.get("invoice_id")
        or config.get("defaultInvoiceId")
        or safe_defaults["invoice_id"]
    )

    result = invoice_agent(user_id=user_id, invoice_id=invoice_id, message=prompt)
    if not result.get("ok"):
        return {"error": result.get("error") or "Local invoice agent failed"}

    output = result.get("output")
    if not isinstance(output, str):
        return {"error": "Local invoice agent returned no string output"}

    return {
        "output": output,
        "metadata": {
            "user_id": user_id,
            "invoice_id": invoice_id,
        },
    }


if __name__ == "__main__":
    print(
        json.dumps(
            invoice_agent_provider(
                "Say exactly PONG.",
                {},
                {"vars": {"user_id": "qa-static", "invoice_id": "inv-123"}},
            ),
            sort_keys=True,
        )
    )
