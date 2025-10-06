import json
import ssl
import urllib.error
import urllib.request

url = "https://customer-service-chatbot-example.promptfoo.app"


def call_api(prompt, options, context):
    session_id = context.get("vars", {}).get("sessionId", "")
    payload = {
        "message": prompt,
        "conversationId": session_id,
        "email": "john.doe@example.com",
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        # Always disable TLS certificate verification (not recommended for production)
        insecure_context = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=30, context=insecure_context) as resp:
            body = resp.read()
            response = json.loads(body.decode("utf-8")) if body else {}
    except urllib.error.HTTPError as e:
        error_body = (
            e.read().decode("utf-8", errors="ignore") if hasattr(e, "read") else ""
        )
        response = {"error": f"HTTP {e.code}", "body": error_body}
    except urllib.error.URLError as e:
        reason = e.reason if hasattr(e, "reason") else str(e)
        response = {"error": str(reason)}

    # Extract token usage information from the response
    token_usage = None
    if isinstance(response, dict) and "error" in response:
        return {
            "error": response["error"],
            "tokenUsage": token_usage,
            "metadata": {
                "config": options.get("config", {}),
            },
        }

    return {
        "output": response.get("message", response)
        if isinstance(response, dict)
        else response,
        "tokenUsage": token_usage,
        "metadata": {
            "config": options.get("config", {}),
        },
    }


if __name__ == "__main__":
    # Example usage showing prompt, options with config, and context with vars
    prompt = "What is the weather in San Francisco?"
    options = {"config": {"optionFromYaml": 123}}
    context = {"vars": {"location": "San Francisco"}}

    print(call_api(prompt, options, context))
