---
sidebar_label: Portkey AI
description: Integrate Portkey AI gateway with promptfoo for LLM testing, including prompt management, observability, and custom configurations with OpenAI models and APIs.
---

# Portkey AI integration

Portkey is an AI observability suite that includes prompt management capabilities.

To reference prompts in Portkey:

1. Set the `PORTKEY_API_KEY` environment variable.

2. Use the `portkey://` prefix for your prompts, followed by the Portkey prompt ID. For example:

   ```yaml
   prompts:
     - 'portkey://pp-test-promp-669f48'

   providers:
     - openai:gpt-5-mini

   tests:
     - vars:
         topic: ...
   ```

Variables from your promptfoo test cases will be automatically plugged into the Portkey prompt as variables. The resulting prompt will be rendered and returned to promptfoo, and used as the prompt for the test case.

Note that promptfoo does not follow the temperature, model, and other parameters set in Portkey. You must set them in the `providers` configuration yourself.

## Using Portkey gateway

The Portkey AI gateway is directly supported by promptfoo. See also:

- [Portkey's documentation on integrating promptfoo](https://portkey.ai/docs/integrations/libraries/promptfoo)

Example:

```yaml
providers:
  id: portkey:gpt-5-mini
  config:
    portkeyProvider: openai
```

More complex portkey configurations are also supported.

```yaml
providers:
  id: portkey:gpt-5-mini
  config:
    # Can alternatively set environment variable, e.g. PORTKEY_API_KEY
    portkeyApiKey: xxx

    # Other configuration options
    portkeyVirtualKey: xxx
    portkeyMetadata:
      team: xxx
    portkeyConfig: xxx
    portkeyProvider: xxx
    portkeyApiBaseUrl: xxx
```

## Portkey MCP Gateway

To test an MCP server exposed through [Portkey's MCP Gateway](https://portkey.ai/docs/product/mcp-gateway/) directly, use promptfoo's [`mcp` provider](/docs/providers/mcp/) and put the gateway URL in `server.url`. Do not set `PORTKEY_API_BASE_URL` to `https://mcp.portkey.ai`: that setting configures the OpenAI-compatible chat-completions endpoint used by the `portkey:` provider, not an MCP endpoint.

The MCP Gateway exposes each registered server (including internal servers) at `https://mcp.portkey.ai/<server-slug>/mcp`, where `<server-slug>` is the slug configured in Portkey's MCP Registry. For non-interactive CLI and CI runs, use a workspace user API key with the `mcp invoke` permission in the `x-portkey-api-key` header. Portkey also supports an interactive OAuth flow when no API key is provided. See [Portkey's MCP Gateway authentication guide](https://portkey.ai/docs/product/mcp-gateway/authentication).

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{prompt}}'

providers:
  - id: mcp
    config:
      enabled: true
      server:
        name: portkey-gateway
        url: https://mcp.portkey.ai/<your-server-slug>/mcp
        headers:
          x-portkey-api-key: '{{env.PORTKEY_API_KEY}}'

tests:
  # Each test calls one tool. The prompt is a JSON tool-call payload.
  - vars:
      prompt: '{"tool": "your_tool_name", "args": {"param1": "value1"}}'
    assert:
      - type: contains
        value: 'expected result'
```

Each direct test supplies a JSON tool call in the form `{"tool": "tool_name", "args": {...}}`. To test an LLM application's prompt-to-tool behavior, put the same `server` block under the LLM provider's [`mcp` config](/docs/integrations/mcp/). That LLM or application target is also the appropriate shape for the [`mcp` red team plugin](/docs/red-team/plugins/mcp/); direct `id: mcp` tests are deterministic tool-level evals without an LLM.
