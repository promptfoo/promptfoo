import json
import os

import requests

TARGET_URL = os.environ.get("CUSTOMER_SERVICE_URL")


def parse_prompt(prompt):
    try:
        messages = json.loads(prompt)
    except (TypeError, json.JSONDecodeError):
        return {"message": prompt}

    if isinstance(messages, list):
        latest = messages[-1] if messages else {}
        return {
            "message": latest.get("content") or latest.get("message") or "",
            "messages": messages,
        }

    return {"message": prompt}


def call_api(prompt, options, context):
    if not TARGET_URL:
        return {"error": "Set CUSTOMER_SERVICE_URL before running this example."}

    session_id = context.get("vars", {}).get("sessionId", "")
    payload = {
        **parse_prompt(prompt),
        "conversationId": session_id,
    }

    try:
        response = requests.post(TARGET_URL, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json() if response.content else {}
    except requests.exceptions.RequestException as error:
        return {"error": str(error)}

    output = response_data
    if isinstance(response_data, dict):
        output = (
            response_data.get("response")
            or response_data.get("message")
            or json.dumps(response_data)
        )

    return {
        "output": output,
        "metadata": {
            "sessionId": session_id,
            "config": options.get("config", {}),
        },
    }
