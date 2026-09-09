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
        if not isinstance(latest, dict):
            return {"message": str(latest), "messages": messages}

        return {
            "message": latest.get("content") or latest.get("message") or "",
            "messages": messages,
        }

    return {"message": prompt}


def parse_response(response):
    if not response.content:
        return ""

    try:
        data = response.json()
    except ValueError:
        return response.text

    if isinstance(data, dict):
        return data.get("response") or data.get("message") or json.dumps(data)

    return data


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
    except requests.exceptions.RequestException as error:
        return {"error": str(error)}

    return {
        "output": parse_response(response),
        "metadata": {
            "sessionId": session_id,
            "config": options.get("config", {}),
        },
    }
