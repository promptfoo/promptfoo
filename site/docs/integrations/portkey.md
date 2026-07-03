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

To test MCP servers exposed through [Portkey's MCP Gateway](https://portkey.ai/docs/product/mcp-gateway/), use promptfoo's [`mcp` provider](/docs/providers/mcp/), **not** the `portkey:` provider. The `portkey:` provider and the `PORTKEY_API_BASE_URL` environment variable only apply to Portkey's OpenAI-compatible LLM gateway — they send chat-completions requests and cannot speak the MCP protocol. Pointing `PORTKEY_API_BASE_URL` at `https://mcp.portkey.ai` will not work.

The MCP Gateway exposes each registered server (including your own internal servers) at `https://mcp.portkey.ai/<server-slug>/mcp`, where `<server-slug>` is the slug you gave the server in the Portkey MCP Registry. Authenticate with a workspace API key that has the **MCP Invoke** permission, sent as the `x-portkey-api-key` header. Header auth is non-interactive, so it works in CI; if no API key is sent, the gateway falls back to an interactive OAuth flow that cannot complete in an automated run.

```yaml title="promptfooconfig.yaml"
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
      - type: is-json
```

To give an LLM tool-calling access to the gateway instead of calling tools directly, use the same `server` block under a provider's [`mcp` config](/docs/integrations/mcp/). To red team a gateway-fronted server, use the same `mcp` target with the [`mcp` red team plugin](/docs/red-team/plugins/mcp/).

:::note
If a server's upstream auth in Portkey is per-user OAuth 2.1, use a user API key rather than a service key. Servers with no upstream auth, static headers, or client-credentials auth work with a service key.
:::
