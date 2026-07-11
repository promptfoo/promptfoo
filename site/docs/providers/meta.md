---
sidebar_label: Meta Model API
description: Configure Meta's Model API to evaluate Muse Spark reasoning models with reasoning effort, multimodal input, tool calling, and search grounding in promptfoo
---

# Meta Model API

The [Meta Model API](https://dev.meta.ai/) (public preview) serves Meta Superintelligence Labs' Muse Spark models through an OpenAI-compatible API. The Meta provider extends the [OpenAI provider](/docs/providers/openai/), so all of its options are supported.

:::note

This provider is for the Meta **Model** API at `api.meta.ai` (Muse models), which supersedes Meta's [Llama API](/docs/providers/llamaApi.md) (`api.llama.com`) as Meta's hosted inference service — the Llama API Public Preview was retired on July 6, 2026.

:::

## Setup

1. Create an API key from the API keys tab on the [Meta Model API dashboard](https://dev.meta.ai/).
2. Set the `MODEL_API_KEY` environment variable — Meta's official variable, the same one its SDKs and quickstart use — or specify `apiKey` (or a custom `apiKeyEnvar`) in your config.

```yaml
providers:
  - id: meta:muse-spark-1.1
```

`meta:<model>` defaults to the [Responses API](#responses-api) — Meta's full-feature surface and the one its docs recommend. Use `meta:chat:<model>` for the OpenAI-compatible chat completions endpoint, or `meta:messages:<model>` for the Anthropic-compatible [Messages API](#messages-api). If you omit the model, the provider defaults to `muse-spark-1.1`.

## Available Models

Check the [models page](https://dev.meta.ai/docs/getting-started/models) for the live list. As of writing:

- `muse-spark-1.1` — multimodal reasoning model: 1,048,576-token context window, 131,072 max output tokens, text/image/video/PDF input, tool calling, structured output, and search grounding (Responses and Messages APIs).

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
- `max_completion_tokens` — caps generation on the chat endpoint (Meta accepts `max_tokens` only as a deprecated alias; if you set it, the provider forwards it as the canonical `max_completion_tokens`). On the [Responses API](#responses-api) the cap is `max_output_tokens`, and the provider maps `max_completion_tokens`/`max_tokens` onto it. When unset, no cap is sent so reasoning can use the full output budget.
- `temperature` — supported (0–2, API default 1.0). Promptfoo sends its deterministic default of `0` unless you override it.
- `response_format` — structured output with guaranteed JSON schema matching.
- `tools` / `tool_choice` — parallel tool calling with streamed arguments.
- `prompt_cache_retention` — `in_memory` or `24h` for prompt caching; cached prompt tokens bill at the cached-input rate.
- `seed` — best-effort determinism.

Muse Spark does not support `logprobs`, `n > 1`, `stop`, or audio input/output — the provider fails fast with a clear error for `stop` and `logprobs` instead of surfacing an HTTP 400 per request. OpenAI-scoped environment defaults (`OPENAI_TEMPERATURE`, `OPENAI_TOP_P`, `OPENAI_MAX_COMPLETION_TOKENS`, penalty variables) are not applied to Meta requests.

### Cost Tracking

Promptfoo computes cost from the [published pricing](https://dev.meta.ai/docs/getting-started/pricing-rate-limits) ($1.25 input / $0.15 cached input / $4.25 output per 1M tokens for `muse-spark-1.1`), including the cached-input rate for prompt-cache hits. Override with `cost`, `inputCost`, `outputCost`, or `cacheReadCost` (all in USD per token) if pricing changes or you have custom rates.

## Responses API

`meta:<model>` (the default) and `meta:responses:<model>` target Meta's `/v1/responses` endpoint — the only Meta endpoint that carries reasoning across turns, with built-in web-search grounding:

```yaml
providers:
  - id: meta:responses:muse-spark-1.1
    config:
      reasoning_effort: medium
      tools:
        - type: web_search
```

With `web_search`, the model grounds answers in real-time web results with inline citations. Web search bills separately ($2.50 per 1,000 queries) and is not included in promptfoo's computed token cost.

## Messages API

`meta:messages:<model>` targets Meta's Anthropic-compatible Messages endpoint (`https://api.meta.ai/v1/messages`) — the surface Anthropic-format coding agents such as Claude Code use. Use it to evaluate Muse Spark over the same wire format those agents send:

```yaml
providers:
  - id: meta:messages:muse-spark-1.1
    config:
      max_tokens: 8192
```

The provider extends the [Anthropic provider](/docs/providers/anthropic/), so its options (`max_tokens`, `tools`, image and document content blocks, etc.) apply. Authentication uses your Meta key as a bearer token (`Authorization: Bearer`), matching Meta's docs — Anthropic-scoped settings like `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, and Claude Code OAuth credentials are deliberately ignored on this surface.

Muse Spark's reasoning arrives on this surface as encrypted `redacted_thinking` blocks, so the provider defaults `showThinking` to `false` to keep the ciphertext out of graded output.

## Using with coding-agent providers

Meta positions Muse Spark as a backend for coding agents, and promptfoo's agentic providers can evaluate those setups end to end. In both recipes, set `apiKey` explicitly: the agent subprocesses inherit your shell environment, and an explicit key guarantees your Meta key is used instead of an ambient `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` that belongs to another service.

### Codex CLI

The [`openai:codex-sdk` provider](/docs/providers/openai-codex-sdk) drives Muse Spark over the Responses API:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      base_url: https://api.meta.ai/v1
      model: muse-spark-1.1
      apiKey: '{{env.MODEL_API_KEY}}'
```

The explicit `apiKey` is required — the provider does not read `MODEL_API_KEY` on its own, and without it an ambient `OPENAI_API_KEY` would be sent to the Meta endpoint instead.

### Claude Code

The [`anthropic:claude-agent-sdk` provider](/docs/providers/claude-agent-sdk/) forwards `config.env` to the agent subprocess. Pass the environment Meta's guide prescribes, with `apiKey` set to your Meta key:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      apiKey: '{{env.MODEL_API_KEY}}'
      env:
        ANTHROPIC_BASE_URL: https://api.meta.ai
        ANTHROPIC_AUTH_TOKEN: '{{env.MODEL_API_KEY}}'
        ANTHROPIC_MODEL: muse-spark-1.1
        ANTHROPIC_DEFAULT_OPUS_MODEL: muse-spark-1.1
        ANTHROPIC_DEFAULT_SONNET_MODEL: muse-spark-1.1
        ANTHROPIC_DEFAULT_HAIKU_MODEL: muse-spark-1.1
        CLAUDE_CODE_SUBAGENT_MODEL: muse-spark-1.1
        ENABLE_TOOL_SEARCH: 'true' # Claude Code disables MCP tool search for non-first-party hosts
```

:::warning

Do not omit `apiKey`. The provider forwards its resolved API key into the agent subprocess as `ANTHROPIC_API_KEY` after `env:` is applied — if `apiKey` is unset and a real `ANTHROPIC_API_KEY` is exported in your shell, that Anthropic credential would be transmitted to Meta's endpoint.

:::

Pin every model alias as shown — Meta serves only `muse-spark-1.1`, and Claude Code otherwise routes background tasks, Plan Mode, or subagents to Claude models the Meta API doesn't serve. See Meta's [coding agents guide](https://dev.meta.ai/docs/guides/coding-agents) for the full setup pattern.

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

- Base URL: `https://api.meta.ai/v1` (override with `apiBaseUrl`; the Messages surface uses the bare host `https://api.meta.ai`).
- OpenAI-compatible chat completions (`/chat/completions`) and Responses (`/responses`) endpoints, plus the Anthropic-compatible Messages (`/messages`) endpoint.
- Rate limits apply per team, not per key: 60 RPM / 2M TPM on the free tier, 3,000 RPM / 4M TPM paid.
- Full [API documentation](https://dev.meta.ai/docs/getting-started/overview).

## See Also

- [OpenAI Provider](/docs/providers/openai/) — compatible configuration options
- [Llama API Provider](/docs/providers/llamaApi.md) — Meta's hosted Llama models
- [Meta Model API docs](https://dev.meta.ai/docs/getting-started/overview) and [pricing](https://dev.meta.ai/docs/getting-started/pricing-rate-limits)
