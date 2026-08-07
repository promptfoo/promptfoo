---
sidebar_label: Fireworks AI
description: Configure Fireworks AI's serverless chat and embedding models through their OpenAI-compatible API for LLM evaluation and testing with promptfoo
---

# Fireworks AI

[Fireworks AI](https://fireworks.ai) serves a broad catalogue of open models — Llama, Qwen, DeepSeek, Kimi, GLM, GPT-OSS, and more — through an API that is fully compatible with the OpenAI interface.

The Fireworks AI provider supports all options available in the [OpenAI provider](/docs/providers/openai/).

## Setup

Create an API key from the Fireworks dashboard (**Settings → API Keys**) and expose it as an environment variable:

```sh
export FIREWORKS_API_KEY=your_api_key_here
```

The provider keeps Fireworks credentials isolated from OpenAI's: it reads `FIREWORKS_API_KEY` (never `OPENAI_API_KEY`) and never inherits `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` / `OPENAI_ORGANIZATION`, so a stray OpenAI variable in your environment can't leak onto or reroute Fireworks requests.

## Provider format

- `fireworks:<model>` — chat completions, e.g. `fireworks:accounts/fireworks/models/gpt-oss-120b`
- `fireworks:embedding:<model>` — embeddings, e.g. `fireworks:embedding:accounts/fireworks/models/qwen3-embedding-8b`

Model identifiers use Fireworks's account-scoped path (`accounts/fireworks/models/<model>`). Browse the [serverless catalogue](https://fireworks.ai/models?deployment=serverless) for available ids — the serverless tier rotates, so a model that returns a 404 has likely been retired.

## Example Usage

```yaml
providers:
  - id: fireworks:accounts/fireworks/models/gpt-oss-120b
    config:
      temperature: 0.2
      max_tokens: 1024
      apiKey: ... # optional; overrides FIREWORKS_API_KEY
```

:::note
Many of Fireworks's flagship models are reasoning models that emit hidden reasoning tokens before the visible answer. Set `max_tokens` high enough to leave room for both — otherwise the response can be truncated to empty output.
:::

Run the bundled example end-to-end:

```sh
npx promptfoo@latest init --example provider-fireworks
```

## Embeddings

Fireworks serves embedding models on the same key via the `fireworks:embedding:` prefix. For example, to grade a [`similar` assertion](/docs/configuration/expected-outputs/similar) with a Fireworks embedding model:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: fireworks:embedding:accounts/fireworks/models/qwen3-embedding-8b
```

## Configuration

Because the provider extends the OpenAI provider, all [OpenAI configuration parameters](/docs/providers/openai/#configuring-parameters) apply. The most common options:

| Option                                             | Description                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`                                           | Fireworks API key (overrides the `FIREWORKS_API_KEY` environment variable).                                                                                |
| `apiBaseUrl`                                       | Base URL override. Can also be set with the `FIREWORKS_API_BASE_URL` environment variable.                                                                 |
| `apiHost`                                          | Host override for a proxy or gateway; resolves to `https://<apiHost>/v1`.                                                                                  |
| `temperature`, `max_tokens`, `top_p`, `top_k`, ... | Standard OpenAI-compatible sampling parameters.                                                                                                            |
| `cost`, `inputCost`, `outputCost`                  | Override promptfoo's cost estimate (USD per token). Use `inputCost` and `outputCost` for asymmetric pricing; `cost` is the shared fallback.                |
| `cacheReadInputCost`                               | Per-token rate for Fireworks server-side prompt-cache hits. Defaults to the full `inputCost` (no discount is assumed, since the discount varies by model). |

| Environment variable     | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `FIREWORKS_API_KEY`      | Your Fireworks API key.                                            |
| `FIREWORKS_API_BASE_URL` | Override the base URL (defaults to the public Fireworks endpoint). |

### Cost tracking

Fireworks prices each model differently, so promptfoo can't infer a per-token rate. Supply `inputCost` and `outputCost` to surface spend estimates in your eval results:

```yaml
providers:
  - id: fireworks:accounts/fireworks/models/gpt-oss-120b
    config:
      inputCost: 0.00000015 # $0.15 / 1M input tokens
      outputCost: 0.0000006 # $0.60 / 1M output tokens
```

If you rely on Fireworks's server-side prompt caching, set `cacheReadInputCost` to the discounted cached-input rate; otherwise cached prompt tokens are billed at the full `inputCost`.

## API Details

- **Base URL**: `https://api.fireworks.ai/inference/v1`
- **API format**: OpenAI-compatible (`/chat/completions`, `/embeddings`)
- **Models**: [serverless model catalogue](https://fireworks.ai/models?deployment=serverless)
- Full [API documentation](https://docs.fireworks.ai)
