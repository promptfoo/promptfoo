---
sidebar_label: Portkey AI
description: Integrate the Portkey AI gateway with promptfoo, including model catalog provider slugs, prompt management, observability, and gateway configuration.
---

# Portkey AI integration

Portkey is an AI observability suite that includes prompt management capabilities.

The examples below use OpenAI's current `gpt-5.6` model identifier.

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

Portkey's [model catalog](https://portkey.ai/docs/product/model-catalog) replaced virtual keys. Models are addressed as `@<ai-provider-slug>/<model-name>`, where the slug is the AI provider from your workspace's catalog and the model name is the one listed against it. Put the whole reference after `portkey:`:

```yaml
providers:
  - id: 'portkey:@bedrock-eu/eu.anthropic.claude-sonnet-4-5-20250929-v1:0'
```

Colons in the model name are preserved, so Bedrock and Vertex identifiers work as-is.

The slug can also be sent separately, which is useful when the same model name is served by more than one provider:

```yaml
providers:
  - id: 'portkey:eu.anthropic.claude-sonnet-4-5-20250929-v1:0'
    config:
      portkeyProvider: '@bedrock-eu'
```

Both forms authenticate with `PORTKEY_API_KEY`, which must be a key from the workspace that owns the AI provider. The workspace slug itself is not part of the promptfoo config.

`portkeyVirtualKey` continues to work for gateways that have not migrated to the model catalog.

### Gateway options

Any `portkey`-prefixed config key is sent as the matching [Portkey header](https://portkey.ai/docs/api-reference/inference-api/headers), so `portkeyCacheNamespace` becomes `x-portkey-cache-namespace`. The commonly used ones:

| Config key                 | Header                          | Purpose                                                                |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `portkeyApiKey`            | `x-portkey-api-key`             | Portkey credential. Prefer the `PORTKEY_API_KEY` environment variable. |
| `portkeyProvider`          | `x-portkey-provider`            | AI provider slug (`@my-provider`) or provider name.                    |
| `portkeyVirtualKey`        | `x-portkey-virtual-key`         | Legacy credential reference, superseded by the provider slug.          |
| `portkeyConfig`            | `x-portkey-config`              | Config ID or JSON object for routing, caching, and fallbacks.          |
| `portkeyCustomHost`        | `x-portkey-custom-host`         | Base URL for privately hosted models.                                  |
| `portkeyMetadata`          | `x-portkey-metadata`            | Metadata for filtering in Portkey analytics.                           |
| `portkeyTraceId`           | `x-portkey-trace-id`            | Correlates related requests.                                           |
| `portkeyCacheForceRefresh` | `x-portkey-cache-force-refresh` | Bypasses the Portkey cache for the request.                            |
| `portkeyCacheNamespace`    | `x-portkey-cache-namespace`     | Partitions the cache store.                                            |
| `portkeyRequestTimeout`    | `x-portkey-request-timeout`     | Timeout in milliseconds.                                               |

`portkeyApiBaseUrl` is the exception: it sets the gateway URL promptfoo calls rather than a header, and defaults to `https://api.portkey.ai/v1`. The `PORTKEY_API_BASE_URL` environment variable takes precedence over it.

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
