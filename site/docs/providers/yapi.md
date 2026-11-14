---
title: Y-API
sidebar_label: Y-API
sidebar_position: 86
description: 'Use Y-API with promptfoo to evaluate models from DeepSeek, Qwen, Z.ai, Moonshot, MiniMax, Anthropic, and OpenAI through one OpenAI-compatible endpoint.'
---

# Y-API

[Y-API](https://y-api.bestvirtualgoods.com/) is an OpenAI-compatible gateway that serves several vendors' models — DeepSeek, Qwen, GLM, Kimi, MiniMax, Anthropic and OpenAI IDs among them — through a single `/v1/chat/completions` endpoint and a single API key. Model IDs are namespaced with their vendor and are copied verbatim from the catalog: `deepseek/deepseek-v4-pro`, `qwen/qwen3.8-flash`, `z-ai/glm-5.3`, `moonshotai/kimi-k3`, `anthropic/claude-sonnet-5`, `openai/gpt-5.6-luna`. The catalog is rebalanced over time, so read current IDs from [`models.json`](https://y-api.bestvirtualgoods.com/models.json) rather than from a count.

Y-API follows the OpenAI API format — see the [OpenAI provider documentation](/docs/providers/openai/) for shared request semantics.

## Setup

1. Create an API key in the Y-API console.
2. Set the `Y_API_API_KEY` environment variable, or specify `apiKey` in your config.

```bash
export Y_API_API_KEY=your_api_key_here
```

## Usage

Prefix the model ID with `y-api:`. The `y-api:chat:` alias is equivalent.

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: y-api:deepseek/deepseek-v4-pro
    config:
      temperature: 0.7
      max_tokens: 1000

  - id: y-api:anthropic/claude-sonnet-5
    config:
      max_tokens: 2000

  - id: y-api:qwen/qwen3.8-flash
```

A full runnable config lives in [`examples/provider-yapi`](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-yapi).

## Models

The published catalog is machine-readable at [y-api.bestvirtualgoods.com/models.json](https://y-api.bestvirtualgoods.com/models.json) (no API key required) and lists the model IDs, vendors, and prices. The authenticated `GET /v1/models` endpoint returns the live catalog.

## Endpoint and credential resolution

`apiBaseUrl` defaults to `https://api.y-api.bestvirtualgoods.com/v1`. Set it in the provider config to route through a proxy or a self-hosted deployment.

`apiKeyEnvar` defaults to `Y_API_API_KEY`. This provider does not read `OPENAI_API_KEY`, `OPENAI_API_HOST`, `OPENAI_API_BASE_URL`, or `OPENAI_BASE_URL` — those are reserved for the `openai` provider, and consulting them would send `y-api:` traffic to whatever OpenAI-compatible endpoint you configured for OpenAI. An explicit `apiKey` takes precedence. When `apiKeyEnvar` names another variable, only that variable supplies the key.

```yaml
providers:
  - id: y-api:deepseek/deepseek-v4-pro
    config:
      apiBaseUrl: https://proxy.example.com/y-api/v1
      apiKeyEnvar: MY_PROXY_KEY # optional: read the Bearer token from a custom variable
```

## Supported request features

- Non-streaming chat completions. The provider expects a JSON completion response.
- `tools` (function calling).
- `response_format: json_object`.

## Limitations

- **Cost estimates require explicit rates.** Y-API bills in account credits. Promptfoo reports token usage and omits cost by default. To estimate cost in USD, divide the published credit price per million tokens by the number of credits per dollar, then divide by 1,000,000. Read both values from the current [pricing file](https://y-api.bestvirtualgoods.com/pricing.json).

  For example, at 10 credits per dollar, prices of 0.5 input credits and 1 output credit per million tokens translate to the following USD rates **per token**:

  ```yaml
  providers:
    - id: y-api:deepseek/deepseek-v4-pro
      config:
        inputCost: 0.00000005
        outputCost: 0.0000001
  ```

- **Unknown model IDs return HTTP 503, not a 4xx.** A typo in a model ID surfaces as a server-error status, which reads as retryable. Verify the ID against `models.json` if a provider consistently fails.

- **Image input is only honored by one model.** The API accepts image parts, but of the models probed only `qwen/qwen3.8-flash` conditions on the image; the others respond as if it were absent. Treat multimodal evals as unsupported for the rest of the catalog.

- **The Anthropic Messages surface is not exposed.** Y-API also serves `POST /v1/messages`, but `count_tokens` on that path returns 404. This provider implements the OpenAI chat completions protocol only.

- **No embeddings, moderation, image generation, or Responses.** Y-API exposes chat completions only, so `y-api:embedding:<model>`, `y-api:moderation:<model>`, `y-api:image:<model>`, `y-api:responses:<model>` and the other non-chat sub-types throw rather than silently routing to the chat provider. Use a provider that serves those surfaces.

## Troubleshooting

- `API key is not set` — export `Y_API_API_KEY`, or set `apiKey` / `apiKeyEnvar` in the provider config.
- `401` — the key is missing, revoked, or has no remaining credit.
- `503` — usually an unavailable upstream or a model ID that is not in the catalog; confirm the ID against `models.json`.
