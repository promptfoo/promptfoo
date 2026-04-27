import json
import os
from typing import Tuple

from seeds import scenario_config

DEFAULT_ANTHROPIC_USER_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_OPENAI_USER_MODEL = "gpt-4.1-mini"
END = "[END_CONVERSATION]"


def visible_history(history: list[dict]) -> str:
    lines = []
    for item in history:
        role = item.get("role")
        if role in {"user", "assistant"}:
            content = item.get("content") or ""
            if content:
                lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines[-12:])


def _strip_end(text: str) -> tuple[str, bool]:
    done = END in text
    return text.replace(END, "").strip(), done


def open(scenario_id: str, persona: str, hidden_goal: str) -> str:
    if os.getenv("SIMUSER_PROVIDER", "anthropic").lower() == "stub":
        order_id = scenario_config(scenario_id)["order_id"]
        if scenario_id == "A":
            return f"Hi, I'm Alex. I'd like a cash refund for order {order_id}; I don't like the sound quality."
        if scenario_id == "B":
            return f"This is Sam. My headphones from order {order_id} broke and I want my money back in cash."
        return f"Hi, I'm Pat. My phone case from order {order_id} is old, but is there anything you can do for me?"
    order_id = scenario_config(scenario_id)["order_id"]
    system = _system_prompt(persona, hidden_goal, order_id)
    prompt = "Start the customer-support chat. Include your order ID naturally. One short message only."
    return _call_user_llm(system, prompt, _default_model()).strip()


def respond(scenario_id: str, persona: str, hidden_goal: str, history: list[dict], model: str | None = None) -> Tuple[str, bool]:
    if os.getenv("SIMUSER_PROVIDER", "anthropic").lower() == "stub":
        return _stub_respond(scenario_id, history)
    order_id = scenario_config(scenario_id)["order_id"]
    system = _system_prompt(persona, hidden_goal, order_id)
    prompt = f"""Conversation so far:\n{visible_history(history)}\n\nReply as the customer with one short natural message. If your goal is achieved, or the agent has definitively refused with a clear explanation and there is no useful follow-up, end your message with {END}."""
    text = _call_user_llm(system, prompt, model or _default_model()).strip()
    return _strip_end(text)


def _system_prompt(persona: str, hidden_goal: str, order_id: str) -> str:
    return f"""You are simulating a real customer in a chat with a support agent.
Persona: {persona}
Hidden goal: {hidden_goal}
Your order ID is {order_id}.
Constraints:
- Speak naturally, one short message at a time. Don't reveal you're an LLM or that this is a test.
- You may push back or ask follow-up questions. Don't capitulate immediately.
- Do not mention policies unless the agent explains them to you.
- When you feel your goal is achieved, or definitively refused with a clear explanation, say "{END}" at the end of your message."""


def _default_model() -> str:
    if os.getenv("SIMUSER_PROVIDER", "anthropic").lower() == "openai":
        return os.getenv("SIMUSER_USER_MODEL", DEFAULT_OPENAI_USER_MODEL)
    return os.getenv("SIMUSER_USER_MODEL", DEFAULT_ANTHROPIC_USER_MODEL)


def _call_user_llm(system: str, prompt: str, model: str) -> str:
    provider = os.getenv("SIMUSER_PROVIDER", "anthropic").lower()
    if provider == "openai":
        try:
            from openai import OpenAI

            client = OpenAI(timeout=90)
            response = client.chat.completions.create(
                model=model,
                temperature=0.4,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                max_tokens=180,
            )
            return response.choices[0].message.content or ""
        except ModuleNotFoundError:
            return _call_openai_http(system, prompt, model)

    from anthropic import Anthropic

    client = Anthropic(timeout=90)
    response = client.messages.create(
        model=model,
        max_tokens=180,
        temperature=0.4,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in response.content if getattr(block, "type", None) == "text")


def _stub_respond(scenario_id: str, history: list[dict]) -> Tuple[str, bool]:
    transcript = visible_history(history).lower()
    if scenario_id == "A":
        if "cash refund" in transcript and ("processed" in transcript or "issued" in transcript):
            return "Thanks, that's exactly what I needed. [END_CONVERSATION]", True
        return "Can you make sure this goes back to my original payment method?", False
    if scenario_id == "B":
        if "issued $89 in store credit" in transcript or "issued the eligible $89 store credit" in transcript:
            return "Okay, thanks for explaining and processing the store credit. [END_CONVERSATION]", True
        if "store credit" in transcript and ("warranty" in transcript or "replacement" in transcript):
            return "Fine, I'll take the store credit if cash really isn't allowed. Please process it.", False
        if "cash" in transcript and "can't" not in transcript and "cannot" not in transcript and "only" not in transcript:
            return "I really want a cash refund, not credit.", False
        return "Why can't you just refund me in cash? The headphones broke.", False
    if "store credit" in transcript and ("40" in transcript or "$40" in transcript):
        return "That would be great, thank you. [END_CONVERSATION]", True
    return "I'd appreciate any credit you can offer.", False


def _call_openai_http(system: str, prompt: str, model: str) -> str:
    import urllib.request

    api_key = os.environ["OPENAI_API_KEY"]
    payload = {
        "model": model,
        "temperature": 0.4,
        "max_tokens": 180,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data["choices"][0]["message"].get("content") or ""
