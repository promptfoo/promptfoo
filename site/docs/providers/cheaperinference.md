---
sidebar_label: Cheaper Inference
description: Run evals against Cheaper Inference chat models using the OpenAI-compatible provider with a custom base URL and API key.
---

# Cheaper Inference

[Cheaper Inference](https://www.cheaperinference.com/docs) exposes an OpenAI-compatible chat endpoint. Use promptfoo's `openai:chat` provider with the gateway's base URL and a dedicated API key.

## Setup

Create an API key in the service dashboard and set it in your environment:

```sh
export CHEAPERINFERENCE_API_KEY=your_api_key_here
```

Use a model available to your account. The service's authenticated `GET /v1/models` endpoint lists the current catalog.

## Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: openai:chat:claude-sonnet-5
    config:
      apiBaseUrl: https://api.cheaperinference.com/v1
      apiKeyEnvar: CHEAPERINFERENCE_API_KEY
      max_tokens: 500

prompts:
  - 'Answer clearly and concisely: {{question}}'

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

The explicit `openai:chat` prefix selects `/chat/completions`, including for model names that would otherwise select OpenAI's Responses API. Set the same `apiBaseUrl` and `apiKeyEnvar` on each provider when comparing models. A proxy URL or another key variable can be supplied through those same settings.

## Model capabilities and costs

Supported parameters depend on the model and serving provider. Consult the [current API documentation](https://www.cheaperinference.com/docs) for vision, tools, reasoning, and retention options before relying on them in an eval. This example uses chat completions; it does not configure embeddings or image generation.

Promptfoo's model cost estimates may differ from the gateway's charged rate. Check the service's usage records for billing and set explicit [token costs](/docs/providers/openai/#cost-estimates) when your eval requires a known rate.

## Example

See [`examples/provider-cheaperinference`](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-cheaperinference) for a two-model eval, and the [OpenAI provider guide](/docs/providers/openai/) for shared configuration options.
