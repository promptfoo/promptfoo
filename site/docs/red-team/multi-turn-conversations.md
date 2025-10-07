---
sidebar_position: 10000
description: Guide for using custom providers with multi-turn attacks
---

# Multi-Turn Conversations With Custom Provider

When using HTTP or custom providers with multi-turn attacks like GOAT and/or Crescendo, you may need to maintain session IDs between rounds. You can refer to the [session management guide](/docs/providers/http/#session-management) for more details on how session management can be configured for different providers. In the example below, we use client-side session management to create a unique session or conversation ID for each test, and add it in the for each turn in the conversation.

1.  Configure your target using a local python script:

```yaml
targets:
  - file://multi-turn.py
```

2.  Add client-side session management to the root of your configuration:

```yaml
defaultTest:
  options:
    transformVars: '{ ...vars, sessionId: context.uuid }'
```

3.  Retrieve the sessionId from the context in your script, and use it in either a header or payload.

```python
def call_api(prompt, options, context):
    session_id = context.get("vars", {}).get("sessionId", "")
```

A complete example can be found [in our github](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-custom-provider-multi-turn)
