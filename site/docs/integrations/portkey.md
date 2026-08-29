---
sidebar_label: Portkey AI
description: Integrate the Portkey AI gateway with promptfoo, including model catalog provider slugs, prompt management, observability, and gateway configuration.
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
     - openai:gpt-5.6

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
  - id: portkey:gpt-5.6
    config:
      portkeyProvider: openai
```

### Model catalog

Portkey's [model catalog](https://portkey.ai/docs/product/model-catalog) replaced virtual keys. Address models as `@<ai-provider-slug>/<model-name>` after the `portkey:` prefix:

```yaml
providers:
  - id: 'portkey:@bedrock-eu/eu.anthropic.claude-sonnet-4-5-20250929-v1:0'
```

Colons in the model name are preserved, so Bedrock and Vertex identifiers work as-is.

Send the slug separately when the same model name is served by more than one provider:

```yaml
providers:
  - id: 'portkey:eu.anthropic.claude-sonnet-4-5-20250929-v1:0'
    config:
      portkeyProvider: '@bedrock-eu'
```

Use a `PORTKEY_API_KEY` from the workspace that owns the AI provider.

### Gateway options

Any `portkey`-prefixed config key is sent as the matching [Portkey header](https://portkey.ai/docs/api-reference/inference-api/headers), so `portkeyCacheNamespace` becomes `x-portkey-cache-namespace`. Common options:

| Parameter                  | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `portkeyApiKey`            | Portkey credential.                                            |
| `portkeyProvider`          | AI provider slug (`@my-provider`) or provider name.            |
| `portkeyVirtualKey`        | Legacy credential reference. Use a model catalog slug instead. |
| `portkeyConfig`            | Config ID or JSON object for routing, caching, and fallbacks.  |
| `portkeyCustomHost`        | Base URL for privately hosted models.                          |
| `portkeyMetadata`          | Metadata for filtering in Portkey analytics.                   |
| `portkeyTraceId`           | Correlates related requests.                                   |
| `portkeyCacheForceRefresh` | Bypasses the Portkey cache for the request.                    |
| `portkeyCacheNamespace`    | Partitions the cache store.                                    |
| `portkeyRequestTimeout`    | Timeout in milliseconds.                                       |

`portkeyApiBaseUrl` sets the gateway URL Promptfoo calls, defaulting to `https://api.portkey.ai/v1`; `PORTKEY_API_BASE_URL` overrides it.

```yaml
providers:
  - id: portkey:gpt-5.6
    config:
      portkeyProvider: openai
      portkeyMetadata:
        team: platform
      portkeyTraceId: nightly-eval
```

## Portkey MCP Gateway

Promptfoo can connect to [Portkey's MCP Gateway](https://portkey.ai/docs/product/mcp-gateway/) in two ways. Use the [`mcp` provider](/docs/providers/mcp/) to test or red team the MCP server directly. To test an LLM application that uses the server, add the same server block to the model provider's [`mcp` config](/docs/integrations/mcp/).

`PORTKEY_API_BASE_URL` does not configure the MCP connection. Put the MCP Gateway URL in `server.url` instead.

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
