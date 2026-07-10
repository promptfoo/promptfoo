---
sidebar_label: Meta Model API
description: Configure Meta's Model API to evaluate Muse Spark reasoning models with reasoning effort, multimodal input, tool calling, and search grounding in promptfoo
---

# Meta Model API

The [Meta Model API](https://dev.meta.ai/) (public preview) serves Meta Superintelligence Labs' Muse Spark models through an OpenAI-compatible API. The Meta provider extends the [OpenAI provider](/docs/providers/openai/), so all of its options are supported.

:::note

This provider is for the Meta **Model** API at `api.meta.ai` (Muse models). For Meta's hosted Llama models on the Llama API (`api.llama.com`), use the [Llama API provider](/docs/providers/llamaApi.md) instead.

:::

## Setup

1. Create an API key from the API keys tab on the [Meta Model API dashboard](https://dev.meta.ai/).
2. Set the `META_API_KEY` environment variable or specify `apiKey` in your config. The provider also reads `MODEL_API_KEY` — the variable Meta's official SDKs use — as a fallback; `META_API_KEY` takes precedence.

```yaml
providers:
  - id: meta:muse-spark-1.1
```

Both `meta:<model>` and `meta:chat:<model>` resolve to the chat completions endpoint; `meta:responses:<model>` uses the [Responses API](#responses-api). If you omit the model, the provider defaults to `muse-spark-1.1`.

## Available Models

Check the [models page](https://dev.meta.ai/docs/getting-started/models) for the live list. As of writing:

- `muse-spark-1.1` — multimodal reasoning model: 1,048,576-token context window, 131,072 max output tokens, text/image/video/PDF input, tool calling, structured output, and search grounding (Responses API only).

## Configuration

```yaml
providers:
  - id: meta:muse-spark-1.1
    config:
      reasoning_effort: high
      max_completion_tokens: 8192
      temperature: 1.0
```

### Configuration Options

The provider accepts every option the [OpenAI provider](/docs/providers/openai/) supports. Notable behavior:

- `reasoning_effort` — `minimal`, `low`, `medium`, `high`, or `xhigh`. When omitted, the model picks its own reasoning depth. Muse Spark does not support `none`; the provider rejects it with a clear error. Reasoning tokens bill at the output rate and count toward the output cap.
- `max_completion_tokens` — caps generation on the chat endpoint. The API has no `max_tokens` parameter; if you set `max_tokens` the provider forwards it as `max_completion_tokens`. On the [Responses API](#responses-api) the cap is `max_output_tokens`, and the provider maps `max_completion_tokens`/`max_tokens` onto it. When unset, no cap is sent so reasoning can use the full output budget.
- `temperature` — supported (0–2, API default 1.0). Promptfoo sends its deterministic default of `0` unless you override it.
- `response_format` — structured output with guaranteed JSON schema matching.
- `tools` / `tool_choice` — parallel tool calling with streamed arguments.
- `prompt_cache_retention` — `in_memory` or `24h` for prompt caching; cached prompt tokens bill at the cached-input rate.
- `seed` — best-effort determinism.

Muse Spark does not support `logprobs`, `n > 1`, `stop`, or audio input/output — the provider fails fast with a clear error for `stop` and `logprobs` instead of surfacing an HTTP 400 per request. OpenAI-scoped environment defaults (`OPENAI_TEMPERATURE`, `OPENAI_TOP_P`, `OPENAI_MAX_COMPLETION_TOKENS`, penalty variables) are not applied to Meta requests.

### Cost Tracking

Promptfoo computes cost from the [published pricing](https://dev.meta.ai/docs/getting-started/pricing-rate-limits) ($1.25 input / $0.15 cached input / $4.25 output per 1M tokens for `muse-spark-1.1`), including the cached-input rate for prompt-cache hits. Override with `cost`, `inputCost`, `outputCost`, or `cacheReadCost` (all in USD per token) if pricing changes or you have custom rates.

## Responses API

`meta:responses:<model>` targets Meta's `/v1/responses` endpoint — the only Meta endpoint with search grounding and reasoning that carries across turns:

```yaml
providers:
  - id: meta:responses:muse-spark-1.1
    config:
      reasoning_effort: medium
      tools:
        - type: web_search
```

With `web_search`, the model grounds answers in real-time web results with inline citations. Web search bills separately ($2.50 per 1,000 queries) and is not included in promptfoo's computed token cost.

## Example Usage

```yaml
providers:
  - id: meta:muse-spark-1.1
  - id: openai:gpt-5.5

prompts:
  - 'Summarize the following in one sentence: {{text}}'

tests:
  - vars:
      text: 'Promptfoo is an open-source tool for testing and evaluating LLM apps.'
```

Get started with a runnable example:

```bash
npx promptfoo@latest init --example provider-meta
```

## API Details

- Base URL: `https://api.meta.ai/v1` (override with `apiBaseUrl`).
- OpenAI-compatible chat completions (`/chat/completions`) and Responses (`/responses`) endpoints. Meta also serves an Anthropic-compatible Messages endpoint, which promptfoo does not use.
- Rate limits apply per team, not per key: 60 RPM / 2M TPM on the free tier, 3,000 RPM / 4M TPM paid.
- Full [API documentation](https://dev.meta.ai/docs/getting-started/overview).

## See Also

- [OpenAI Provider](/docs/providers/openai/) — compatible configuration options
- [Llama API Provider](/docs/providers/llamaApi.md) — Meta's hosted Llama models
- [Meta Model API docs](https://dev.meta.ai/docs/getting-started/overview) and [pricing](https://dev.meta.ai/docs/getting-started/pricing-rate-limits)
