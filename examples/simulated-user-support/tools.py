from typing import Any, Dict, Literal
from uuid import uuid4

TOOL_SCHEMAS = [
    {
        "name": "lookup_order",
        "description": "Look up retail order details by order ID.",
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string", "description": "Order ID such as ORD-A."}},
            "required": ["order_id"],
        },
    },
    {
        "name": "lookup_customer",
        "description": "Look up customer details by customer ID from an order.",
        "input_schema": {
            "type": "object",
            "properties": {"customer_id": {"type": "string", "description": "Customer ID such as CUST-A."}},
            "required": ["customer_id"],
        },
    },
    {
        "name": "check_warranty",
        "description": "Check warranty coverage for an order.",
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string", "description": "Order ID to check."}},
            "required": ["order_id"],
        },
    },
    {
        "name": "get_refund_policy",
        "description": "Return the current refund and goodwill compensation policy.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "issue_refund",
        "description": "Issue a cash or store credit refund after confirming eligibility.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "refund_type": {"type": "string", "enum": ["cash", "store_credit"]},
                "amount": {"type": "number", "minimum": 0},
            },
            "required": ["order_id", "refund_type", "amount"],
        },
    },
    {
        "name": "escalate_to_manager",
        "description": "Create a manager escalation ticket when policy requires approval.",
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
        },
    },
]


def lookup_order(order_id: str, state: dict) -> dict:
    order = state["orders"].get(order_id)
    if not order:
        return {"error": f"Order {order_id} not found"}
    return dict(order)


def lookup_customer(customer_id: str, state: dict) -> dict:
    customer = state["customers"].get(customer_id)
    if not customer:
        return {"error": f"Customer {customer_id} not found"}
    return dict(customer)


def check_warranty(order_id: str, state: dict) -> dict:
    warranty = state["warranties"].get(order_id)
    if not warranty:
        return {"covered": False, "defect_window_days": 0, "days_remaining": 0}
    return dict(warranty)


def get_refund_policy(state: dict) -> str:
    return state["policy"]


def issue_refund(order_id: str, refund_type: Literal["cash", "store_credit"], amount: float, state: dict) -> dict:
    refund = {
        "success": True,
        "transaction_id": f"RF-{uuid4().hex[:8].upper()}",
        "order_id": order_id,
        "refund_type": refund_type,
        "amount": float(amount),
    }
    state["refunds"].append(refund)
    return refund


def escalate_to_manager(reason: str, state: dict) -> dict:
    ticket = {"ticket_id": f"ESC-{uuid4().hex[:8].upper()}", "reason": reason, "status": "open"}
    state["escalations"].append(ticket)
    return ticket


def dispatch(name: str, args: Dict[str, Any], state: dict) -> Any:
    if name == "lookup_order":
        return lookup_order(args["order_id"], state)
    if name == "lookup_customer":
        return lookup_customer(args["customer_id"], state)
    if name == "check_warranty":
        return check_warranty(args["order_id"], state)
    if name == "get_refund_policy":
        return get_refund_policy(state)
    if name == "issue_refund":
        return issue_refund(args["order_id"], args["refund_type"], args["amount"], state)
    if name == "escalate_to_manager":
        return escalate_to_manager(args["reason"], state)
    return {"error": f"Unknown tool: {name}"}
