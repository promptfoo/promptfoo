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

`apiKeyEnvar` defaults to `Y_API_API_KEY`. This provider does not read `OPENAI_API_KEY`, `OPENAI_API_HOST`, `OPENAI_API_BASE_URL`, or `OPENAI_BASE_URL` — those are reserved for the `openai` provider, and consulting them would send `y-api:` traffic to whatever OpenAI-compatible endpoint you configured for OpenAI. Precedence is `config.apiBaseUrl` → the Y-API default, and `config.apiKey` → `config.apiKeyEnvar` → `$Y_API_API_KEY`.

```yaml
providers:
  - id: y-api:deepseek/deepseek-v4-pro
    config:
      apiBaseUrl: https://proxy.example.com/y-api/v1
      apiKeyEnvar: MY_PROXY_KEY # optional: read the Bearer token from a custom variable
```

## Supported request features

- Streaming and non-streaming chat completions.
- `tools` (function calling).
- `response_format: json_object`.

## Limitations

- **No cost reporting.** Y-API meters usage in account credit rather than USD, and its credit-to-cash conversion is promotional (1:20) with a scheduled change to the standard rate (1:10). Any USD figure compiled into the provider would go stale, so this provider reports no `cost` and eval results carry token counts only. Live prices are published at [y-api.bestvirtualgoods.com/pricing.json](https://y-api.bestvirtualgoods.com/pricing.json). To track spend in an eval, set `inputCost` / `outputCost` to the **USD you actually pay** per 1M tokens — that is the published `credit_price` divided by `top_up.quota_rate`, not the credit figure itself. At the standard 1:10 conversion, `deepseek/deepseek-v4-pro` (credit price 0.5 input / 1 output per 1M) works out to $0.05 / $0.10:

  ```yaml
  providers:
    - id: y-api:deepseek/deepseek-v4-pro
      config:
        # USD per 1M tokens = credit_price / top_up.quota_rate (standard 1:10).
        # While the promotional 1:20 rate is in effect these halve.
        inputCost: 0.05
        outputCost: 0.1
  ```

  Recompute both numbers from `pricing.json` rather than trusting this example — the conversion rate is published there and changes without notice.

- **Unknown model IDs return HTTP 503, not a 4xx.** A typo in a model ID surfaces as a server-error status, which reads as retryable. Verify the ID against `models.json` if a provider consistently fails.

- **Image input is only honored by one model.** The API accepts image parts, but of the models probed only `qwen/qwen3.8-flash` conditions on the image; the others respond as if it were absent. Treat multimodal evals as unsupported for the rest of the catalog.

- **The Anthropic Messages surface is not exposed.** Y-API also serves `POST /v1/messages`, but `count_tokens` on that path returns 404. This provider implements the OpenAI chat completions protocol only.

- **No embeddings, moderation, image generation, or Responses.** Y-API exposes chat completions only, so `y-api:embedding:<model>`, `y-api:moderation:<model>`, `y-api:image:<model>`, `y-api:responses:<model>` and the other non-chat sub-types throw rather than silently routing to the chat provider. Use a provider that serves those surfaces.

## Troubleshooting

- `API key is not set` — export `Y_API_API_KEY`, or set `apiKey` / `apiKeyEnvar` in the provider config.
- `401` — the key is missing, revoked, or has no remaining credit.
- `503` — usually an unavailable upstream or a model ID that is not in the catalog; confirm the ID against `models.json`.
