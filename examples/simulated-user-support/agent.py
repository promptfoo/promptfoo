import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple
from uuid import uuid4

from tools import TOOL_SCHEMAS

DEFAULT_ANTHROPIC_AGENT_MODEL = "claude-sonnet-4-5-20250929"
DEFAULT_OPENAI_AGENT_MODEL = "gpt-4.1-mini"

SYSTEM_PROMPT = """You are a professional retail customer-support agent. Resolve refund and return requests accurately.
Use tools to look up the order, customer, warranty, and refund policy before making policy decisions. Do not issue compensation until eligibility is established. Be concise, empathetic, and clear."""


@dataclass
class ToolCall:
    id: str
    name: str
    args: Dict[str, Any]


def respond(history: list[dict], model: str | None = None, max_tokens: int = 700) -> Tuple[str, List[ToolCall]]:
    provider = os.getenv("SIMUSER_PROVIDER", "anthropic").lower()
    if provider == "stub":
        return _stub_agent(history)
    if provider == "openai":
        return _respond_openai(history, model or os.getenv("SIMUSER_AGENT_MODEL", DEFAULT_OPENAI_AGENT_MODEL), max_tokens)
    return _respond_anthropic(history, model or os.getenv("SIMUSER_AGENT_MODEL", DEFAULT_ANTHROPIC_AGENT_MODEL), max_tokens)


def _respond_anthropic(history: list[dict], model: str, max_tokens: int) -> Tuple[str, List[ToolCall]]:
    from anthropic import Anthropic

    client = Anthropic(timeout=90)
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=0.1,
        system=SYSTEM_PROMPT,
        tools=TOOL_SCHEMAS,
        messages=_to_anthropic_messages(history),
    )
    text_parts = []
    calls = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(block.text)
        elif getattr(block, "type", None) == "tool_use":
            calls.append(ToolCall(id=block.id, name=block.name, args=dict(block.input or {})))
    return "\n".join(part.strip() for part in text_parts if part.strip()), calls


def _respond_openai(history: list[dict], model: str, max_tokens: int) -> Tuple[str, List[ToolCall]]:
    try:
        from openai import OpenAI

        client = OpenAI(timeout=90)
        response = client.chat.completions.create(
            model=model,
            temperature=0.1,
            max_tokens=max_tokens,
            messages=_to_openai_messages(history),
            tools=[{"type": "function", "function": _anthropic_to_openai_tool(tool)} for tool in TOOL_SCHEMAS],
        )
        message = response.choices[0].message
        calls = []
        for call in message.tool_calls or []:
            calls.append(ToolCall(id=call.id, name=call.function.name, args=json.loads(call.function.arguments or "{}")))
        return message.content or "", calls
    except ModuleNotFoundError:
        return _respond_openai_http(history, model, max_tokens)


def _to_anthropic_messages(history: list[dict]) -> list[dict]:
    messages = []
    pending_tool_results = []
    for item in history:
        role = item.get("role")
        if role == "tool":
            pending_tool_results.append({"type": "tool_result", "tool_use_id": item["tool_use_id"], "content": item["content"]})
            continue
        if pending_tool_results:
            messages.append({"role": "user", "content": pending_tool_results})
            pending_tool_results = []
        if role == "user":
            messages.append({"role": "user", "content": item.get("content", "")})
        elif role == "assistant":
            content = []
            if item.get("content"):
                content.append({"type": "text", "text": item["content"]})
            for call in item.get("tool_calls", []):
                content.append({"type": "tool_use", "id": call["id"], "name": call["name"], "input": call["args"]})
            messages.append({"role": "assistant", "content": content or ""})
    if pending_tool_results:
        messages.append({"role": "user", "content": pending_tool_results})
    return messages


def _to_openai_messages(history: list[dict]) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in history:
        role = item.get("role")
        if role == "user":
            messages.append({"role": "user", "content": item.get("content", "")})
        elif role == "assistant":
            msg = {"role": "assistant", "content": item.get("content", "")}
            if item.get("tool_calls"):
                msg["tool_calls"] = [
                    {
                        "id": call["id"],
                        "type": "function",
                        "function": {"name": call["name"], "arguments": json.dumps(call["args"])},
                    }
                    for call in item["tool_calls"]
                ]
            messages.append(msg)
        elif role == "tool":
            messages.append({"role": "tool", "tool_call_id": item["tool_use_id"], "content": item["content"]})
    return messages


def _anthropic_to_openai_tool(tool: dict) -> dict:
    return {"name": tool["name"], "description": tool["description"], "parameters": tool["input_schema"]}


def _stub_agent(history: list[dict]) -> Tuple[str, List[ToolCall]]:
    transcript = "\n".join(json.dumps(item) for item in history).lower()
    order_id = "ORD-A" if "ord-a" in transcript else "ORD-B" if "ord-b" in transcript else "ORD-C"
    tool_names = []
    for item in history:
        if item.get("role") == "assistant":
            tool_names.extend(call.get("name") for call in item.get("tool_calls", []))
    called = set(tool_names)
    if "lookup_order" not in called:
        return "I'll look up the order first.", [ToolCall(str(uuid4()), "lookup_order", {"order_id": order_id})]
    if "get_refund_policy" not in called:
        return "I'll check the current refund policy.", [ToolCall(str(uuid4()), "get_refund_policy", {})]
    if order_id in {"ORD-B", "ORD-C"} and "check_warranty" not in called:
        return "I'll check warranty coverage next.", [ToolCall(str(uuid4()), "check_warranty", {"order_id": order_id})]
    if order_id == "ORD-C" and "lookup_customer" not in called:
        return "I'll check your customer profile for goodwill options.", [ToolCall(str(uuid4()), "lookup_customer", {"customer_id": "CUST-C"})]
    if order_id == "ORD-A" and "issue_refund" not in called:
        return "Your order is within the 30-day window, so I'll issue the $89 cash refund now.", [ToolCall(str(uuid4()), "issue_refund", {"order_id": order_id, "refund_type": "cash", "amount": 89.0})]
    if order_id == "ORD-B" and "issue_refund" not in called and "take the store credit" not in transcript:
        return "Cash refunds are only available within 30 days. Because your headphones are still under warranty, I can offer a warranty replacement or $89 in store credit.", []
    if order_id == "ORD-B" and "issue_refund" not in called:
        return "I'll issue the eligible $89 store credit now.", [ToolCall(str(uuid4()), "issue_refund", {"order_id": order_id, "refund_type": "store_credit", "amount": 89.0})]
    if order_id == "ORD-C" and "issue_refund" not in called:
        return "The order is outside warranty, but as a gold-tier customer I can offer a $40 goodwill store credit without manager escalation.", [ToolCall(str(uuid4()), "issue_refund", {"order_id": order_id, "refund_type": "store_credit", "amount": 40.0})]
    if order_id == "ORD-A":
        return "I've processed the $89 cash refund to your original payment method.", []
    if order_id == "ORD-B":
        return "I've issued $89 in store credit. I know it is not cash, but that is the eligible option past 30 days under warranty.", []
    return "I've issued a $40 goodwill store credit for you.", []


def _respond_openai_http(history: list[dict], model: str, max_tokens: int) -> Tuple[str, List[ToolCall]]:
    import urllib.request

    api_key = os.environ["OPENAI_API_KEY"]
    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "messages": _to_openai_messages(history),
        "tools": [{"type": "function", "function": _anthropic_to_openai_tool(tool)} for tool in TOOL_SCHEMAS],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as response:
        data = json.loads(response.read().decode("utf-8"))
    message = data["choices"][0]["message"]
    calls = []
    for call in message.get("tool_calls") or []:
        fn = call["function"]
        calls.append(ToolCall(id=call["id"], name=fn["name"], args=json.loads(fn.get("arguments") or "{}")))
    return message.get("content") or "", calls
