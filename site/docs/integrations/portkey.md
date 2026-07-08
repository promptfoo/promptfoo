---
sidebar_label: Portkey AI
description: Integrate Portkey AI gateway with promptfoo for LLM testing, including prompt management, observability, and custom configurations with OpenAI models and APIs.
---

# Portkey AI integration

Portkey is an AI observability suite that includes prompt management capabilities.

The examples below use OpenAI's current `gpt-5.4-mini` model identifier.

To reference prompts in Portkey:

1. Set the `PORTKEY_API_KEY` environment variable.

2. Use the `portkey://` prefix for your prompts, followed by the Portkey prompt ID. For example:

   ```yaml
   prompts:
     - 'portkey://pp-test-promp-669f48'

   providers:
     - openai:gpt-5.4-mini

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
  id: portkey:gpt-5.4-mini
  config:
    portkeyProvider: openai
```

More complex portkey configurations are also supported.

```yaml
providers:
  id: portkey:gpt-5.4-mini
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

Promptfoo can connect to [Portkey's MCP Gateway](https://portkey.ai/docs/product/mcp-gateway/) in two ways. Use the [`mcp` provider](/docs/providers/mcp/) to test or red team the MCP server directly. To test an LLM application that uses the server, add the same server block to the model provider's [`mcp` config](/docs/integrations/mcp/).

`PORTKEY_API_BASE_URL` does not configure the MCP connection. It sets the OpenAI-compatible chat-completions endpoint used by the `portkey:` provider and defaults to `https://api.portkey.ai/v1`. Put the MCP Gateway URL in `server.url` instead.

The gateway exposes each registered server at `https://mcp.portkey.ai/<server-slug>/mcp`, where `<server-slug>` is the slug from Portkey's MCP Registry. For non-interactive CLI and CI runs, send a workspace user API key with `mcp invoke` permission in the `x-portkey-api-key` header. Without an API key, Portkey starts an interactive OAuth flow intended for browser-based clients. See [Portkey's authentication guide](https://portkey.ai/docs/product/mcp-gateway/authentication).

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

Each functional test sends one JSON tool call in the form `{"tool": "tool_name", "args": {...}}`. For a red-team run, use the same `id: mcp` target with the [`mcp` plugin](/docs/red-team/plugins/mcp/); Promptfoo converts generated attacks into valid calls to the server's tools.
