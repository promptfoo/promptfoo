# redteam-custom-provider-multi-turn (Red Team Custom Python Provider with Multi-Turn)

This example shows how to pass a stable `sessionId` into a custom Python target while using multi-turn red team strategies.

## Quick Start

```bash
npx promptfoo@latest init --example redteam-custom-provider-multi-turn
cd redteam-custom-provider-multi-turn
pip install -r requirements.txt
export CUSTOMER_SERVICE_URL=https://your-chat-service.example.com/chat
promptfoo redteam run
```

## How It Works

- `promptfooconfig.yaml` creates a per-test `sessionId` with `defaultTest.options.transformVars`.
- `multi-turn.py` reads `context.vars.sessionId`, parses serialized conversation history when strategies use `stateful: false`, and forwards both the latest message and full message history to your target API.
- The `intent` plugin keeps the example self-contained. Add broader plugins such as `harmful` when you want a larger remote-generation scan.
- The strategy configs use small `maxTurns` values so the example stays quick while still exercising multi-turn behavior.

Set `CUSTOMER_SERVICE_URL` to an endpoint that accepts JSON requests with `message`, `messages`, and `conversationId` fields. The example provider accepts either a JSON response with a `response` or `message` field, or a plain text response body.
