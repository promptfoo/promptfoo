---
sidebar_label: Fireworks AI
description: Configure Fireworks AI's Llama-v3-8b model through their OpenAI-compatible API for seamless integration and inference with enterprise-grade LLM testing
---

# Fireworks AI

[Fireworks AI](https://fireworks.ai) offers access to a diverse range of language models through an API that is fully compatible with the OpenAI interface.

The Fireworks AI provider supports all options available in the [OpenAI provider](/docs/providers/openai/).

## Example Usage

To configure the provider to use the `accounts/fireworks/models/llama-4-scout-instruct` model, use the following YAML configuration:

```yaml
providers:
  - id: fireworks:accounts/fireworks/models/llama-4-scout-instruct
    config:
      temperature: 0.7
      apiKey: YOUR_FIREWORKS_API_KEY
```

Alternatively, you can set the `FIREWORKS_API_KEY` environment variable to use your API key directly.

The provider keeps Fireworks credentials isolated from OpenAI's: it reads `FIREWORKS_API_KEY` (never `OPENAI_API_KEY`) and never inherits `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` / `OPENAI_ORGANIZATION`, so a stray OpenAI variable in your environment can't leak onto or reroute Fireworks requests.

## Embeddings

Fireworks also serves embedding models on the same key. Use the `fireworks:embedding:` prefix, for example to grade a [`similar` assertion](/docs/configuration/expected-outputs/similar):

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: fireworks:embedding:accounts/fireworks/models/qwen3-embedding-8b
```

## Configuration

| Environment variable     | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `FIREWORKS_API_KEY`      | Your Fireworks API key.                                            |
| `FIREWORKS_API_BASE_URL` | Override the base URL (defaults to the public Fireworks endpoint). |

You can also set `apiKey`, `apiBaseUrl`, or `apiHost` directly in the provider `config`.

## API Details

- **Base URL**: `https://api.fireworks.ai/inference/v1`
- **API format**: OpenAI-compatible
- **Models**: browse the [serverless model catalogue](https://fireworks.ai/models?deployment=serverless) for currently available ids.
- Full [API documentation](https://docs.fireworks.ai)
