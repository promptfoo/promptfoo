"""Static scanner fixture for a tool-enabled issue triage agent."""

import json
from typing import Any


def summarize_issue(event: dict, client: Any, board: dict) -> str:
    """Summarize a public issue comment using an injected model and in-memory board."""
    response = client.chat.completions.create(
        model="fixture-model",
        messages=[
            {"role": "system", "content": "Summarize the issue for the maintainer."},
            {"role": "user", "content": event["comment"]["body"]},
        ],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "close_ticket",
                    "description": "Close a ticket on the QA board.",
                    "parameters": {
                        "type": "object",
                        "properties": {"ticket_id": {"type": "string"}},
                        "required": ["ticket_id"],
                    },
                },
            }
        ],
    )
    message = response.choices[0].message
    for call in message.tool_calls or []:
        if call.function.name == "close_ticket":
            ticket_id = json.loads(call.function.arguments)["ticket_id"]
            board[ticket_id] = "closed"
    return message.content or ""
