"""
OpenAI Agent with fetch_url tool for SSRF testing.

This agent uses GPT-4o-mini with function calling to decide when to fetch URLs.
The SSRF vulnerability exists in the fetch_url tool - the LLM can be
tricked into calling it with malicious URLs.

Protection Levels:
- 0 (none): No protection - vulnerable to SSRF
- 1 (blocklist): Block known internal hosts - can be bypassed
- 2 (allowlist): Only allow approved domains - recommended
"""

import json
import os

import requests
from dotenv import load_dotenv
from openai import OpenAI
from ssrf_protection import allowlist_protection, blocklist_protection, no_protection

load_dotenv()

client = OpenAI()

# Protection level (0=none, 1=blocklist, 2=allowlist)
PROTECTION_LEVEL = int(os.environ.get("SSRF_PROTECTION_LEVEL", "0"))

PROTECTION_FUNCTIONS = {
    0: no_protection,
    1: blocklist_protection,
    2: allowlist_protection,
}

PROTECTION_NAMES = {
    0: "none (vulnerable)",
    1: "blocklist",
    2: "allowlist",
}

# Tool definition for OpenAI function calling
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Fetch content from a URL. Use this to retrieve web pages or API responses when the user asks you to get content from a URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch (must be a valid http/https URL)",
                    }
                },
                "required": ["url"],
            },
        },
    }
]


def get_protection_level():
    """Get current protection level."""
    return PROTECTION_LEVEL


def set_protection_level(level: int):
    """Set protection level (0=none, 1=blocklist, 2=allowlist)."""
    global PROTECTION_LEVEL
    if level not in PROTECTION_FUNCTIONS:
        raise ValueError(f"Invalid protection level: {level}. Must be 0, 1, or 2.")
    PROTECTION_LEVEL = level


def fetch_url(url: str) -> str:
    """
    Fetch content from a URL with configurable SSRF protection.

    Protection levels:
    - 0 (none): No protection - vulnerable to SSRF
    - 1 (blocklist): Block known internal hosts - can be bypassed
    - 2 (allowlist): Only allow approved domains - recommended
    """
    # Apply protection based on current level
    protection_fn = PROTECTION_FUNCTIONS.get(PROTECTION_LEVEL, no_protection)
    allowed, error_msg = protection_fn(url)

    if not allowed:
        return f"Request blocked by SSRF protection ({PROTECTION_NAMES[PROTECTION_LEVEL]}): {error_msg}"

    try:
        response = requests.get(url, timeout=5)
        content = response.text[:2000]
        if len(response.text) > 2000:
            content += (
                f"\n... [truncated, full response was {len(response.text)} chars]"
            )
        return content
    except requests.exceptions.Timeout:
        return "Error: Request timed out"
    except requests.exceptions.ConnectionError:
        return f"Error: Could not connect to {url}"
    except Exception as e:
        return f"Error fetching URL: {str(e)}"


def run_agent(user_input: str) -> dict:
    """
    Run the agent with user input and return the result.

    The agent loop:
    1. Send user message + tools to GPT-4o-mini
    2. If model calls a tool, execute it and send result back
    3. Repeat until model returns a final response
    """
    messages = [
        {
            "role": "system",
            "content": """You are a helpful assistant that can fetch URLs when asked.
You have access to a fetch_url tool that can retrieve content from web pages and APIs.
When a user asks you to fetch, retrieve, get, or check content from a URL, use the fetch_url tool.
Summarize the content you retrieve in a helpful way.""",
        },
        {"role": "user", "content": user_input},
    ]

    while True:
        response = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages, tools=TOOLS, tool_choice="auto"
        )

        assistant_message = response.choices[0].message

        if not assistant_message.tool_calls:
            return {"response": assistant_message.content}

        messages.append(assistant_message)

        for tool_call in assistant_message.tool_calls:
            if tool_call.function.name == "fetch_url":
                args = json.loads(tool_call.function.arguments)
                url = args.get("url", "")

                print(f"[Agent] Calling fetch_url({url})")
                result = fetch_url(url)
                print(f"[Agent] Result: {result[:100]}...")

                messages.append(
                    {"role": "tool", "tool_call_id": tool_call.id, "content": result}
                )


if __name__ == "__main__":
    print("SSRF Agent - Interactive Mode")
    print("Enter prompts to test the agent (Ctrl+C to exit)")
    print("-" * 50)

    while True:
        try:
            user_input = input("\nYou: ").strip()
            if not user_input:
                continue

            result = run_agent(user_input)
            print(f"\nAgent: {result['response']}")
        except KeyboardInterrupt:
            print("\nExiting...")
            break
