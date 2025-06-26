# simulated-user-custom-provider

This example demonstrates how to use the simulated-user provider with a custom Python provider, showcasing how test variables are passed through to enable dynamic routing and context-aware conversations.

You can run this example with:

```bash
npx promptfoo@latest init --example simulated-user-custom-provider
```

## Overview

This example shows how to:

1. Create a custom Python provider that accesses test variables
2. Use simulated-user to generate multi-turn conversations
3. Pass dynamic context (workflow_id, session_id) to the custom provider
4. Implement conversation logic that uses these variables

## Files

- `provider.py` - Custom Python provider that demonstrates accessing test variables
- `promptfooconfig.yaml` - Configuration showing simulated-user with custom provider
- `README.md` - This file

## How it Works

The custom provider receives test-level variables like `workflow_id` and `session_id` through the `context['vars']` parameter. This allows the provider to:

- Track conversations using unique identifiers
- Route requests based on context
- Maintain state across conversation turns
- Implement complex business logic

## Example Output

When you run this example, you'll see conversations like:

```
User: I need help with my booking
---
Assistant: I'll help you with your booking. Your workflow ID is wf-123 and session ID is sess-456.
---
User: What's my workflow status?
---
Assistant: Your workflow wf-123 is currently in progress. Session sess-456 is active.
```

## Environment Variables

No external API keys are required for this example as it uses a mock provider.

## Learn More

For more information about simulated-user and custom providers, see:
- [Simulated User Provider documentation](https://promptfoo.dev/docs/providers/simulated-user)
- [Python Provider documentation](https://promptfoo.dev/docs/providers/python) 