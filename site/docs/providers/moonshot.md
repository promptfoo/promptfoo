---
sidebar_label: Moonshot (Kimi)
description: Configure Moonshot AI's OpenAI-compatible API to evaluate Kimi K3 and K2 thinking, chat, and vision models with promptfoo
---

# Moonshot (Kimi)

[Moonshot AI](https://platform.kimi.ai/) provides an OpenAI-compatible API for its Kimi models — the Kimi K3 and K2 thinking models and the Moonshot v1 generation models. The Moonshot provider extends the [OpenAI provider](/docs/providers/openai/), so all of its options are supported.

## Setup

1. Get an API key from the [Kimi (Moonshot) platform](https://platform.kimi.ai/console/api-keys).
2. Set the `MOONSHOT_API_KEY` environment variable or specify `apiKey` in your config.

The K3 series models require a successful account top-up of at least $1; see the [access requirements](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart#access-requirements).

```yaml
providers:
  - id: moonshot:kimi-k3.1-pro
```

Both `moonshot:<model>` and `moonshot:chat:<model>` resolve to the chat completions endpoint. If you omit the model, the provider defaults to `kimi-k3.1-pro`.

## Available Models

Moonshot's lineup rotates over time — call the [list models API](https://platform.kimi.ai/docs/api/list-models) (`GET https://api.moonshot.ai/v1/models`) for the live set. As of writing:

- **Kimi K3 series — thinking models, 1M context:** `kimi-k3.1-pro` (flagship), `kimi-k3.1-pro-highspeed` (a 2–3× faster variant of K3.1 Pro), and the previous-generation `kimi-k3`. Always-on reasoning, native image and video understanding, and a top-level `reasoning_effort` control (see below).
- **Kimi K2 — thinking models, 256k context:** `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`. These reason before answering and emit a separate reasoning stream (see below). They are closed to new accounts, and Moonshot plans to retire them at the end of December 2026.

The `moonshot-v1` generation and vision models, `kimi-k2.5`, `kimi-k2-0711-preview`, `kimi-k2-0905-preview`, `kimi-k2-turbo-preview`, `kimi-k2-thinking`, `kimi-k2-thinking-turbo`, and `kimi-latest` are discontinued — Moonshot recommends migrating to `kimi-k3.1-pro`.

## Configuration

```yaml
providers:
  - id: moonshot:kimi-k3.1-pro # flagship thinking model — leave sampling params unset
    config:
      showThinking: false
```

### Configuration Options

The provider accepts every option the [OpenAI provider](/docs/providers/openai/) supports. Commonly used:

- `temperature`, `max_tokens`, `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `response_format` (JSON mode), `tools` / `tool_choice` (function calling)
- `showThinking` — set to `false` to drop a thinking model's reasoning from the graded output (default `true`)
- `cost`, `inputCost`, `outputCost`, `cacheReadCost` — Moonshot ships no built-in price table, so set these to track cost. Every override is in USD per token. Moonshot's [official pricing page](https://platform.kimi.ai/docs/pricing/chat) publishes rates in USD per 1 million tokens, so divide each published rate by `1,000,000` before configuring it. `inputCost`/`outputCost` take precedence over the flat `cost`; `cacheReadCost` prices cached prompt tokens.

For example, these illustrative per-million rates convert to per-token overrides. Check the official pricing page for the current rates for your model before using them.

```yaml
providers:
  - id: moonshot:kimi-k3.1-pro
    config:
      inputCost: 0.000002 # $2.00 per 1M tokens divided by 1,000,000
      cacheReadCost: 0.0000002 # $0.20 per 1M tokens divided by 1,000,000
      outputCost: 0.00001 # $10.00 per 1M tokens divided by 1,000,000
  - id: moonshot:kimi-k3
    config:
      inputCost: 0.000003 # $3.00 per 1M tokens divided by 1,000,000
      cacheReadCost: 0.0000003 # $0.30 per 1M tokens divided by 1,000,000
      outputCost: 0.000015 # $15.00 per 1M tokens divided by 1,000,000
```

The K3 series bills cache writes separately. At the default `5m` cache TTL a write costs the same as uncached input, so `inputCost` covers it. Writes at the `1h` TTL (`prompt_cache_options.ttl: 1h`) cost twice the input rate, but promptfoo prices every cache write at `inputCost`, so reported cost is low for `1h` writes.

Any other parameter supported by the OpenAI provider is forwarded as-is.

## Kimi thinking models

The K3 series and `kimi-k2.x` models are reasoning models and behave differently from the `moonshot-v1` family:

- **Fixed sampling parameters.** Kimi pins `temperature` (`1.0` with thinking on), `top_p`, `n`, and the penalties to fixed values and returns a `400` ("invalid temperature: only 1 is allowed for this model") for any other value. The provider therefore does **not** send promptfoo's default `temperature`/`max_tokens` for `kimi-*` models — leave them unset (recommended) or set `temperature: 1`. The `moonshot-v1` models accept arbitrary sampling values.
- **Reasoning output.** Kimi returns a separate `reasoning_content` stream that promptfoo surfaces with a `Thinking: …` prefix. Set `showThinking: false` when you assert on structured output (for example `is-json`) so the reasoning doesn't contaminate the parsed result.
- **Token budget.** Reasoning tokens count against the output budget. When you leave the token limit unset the provider lets Moonshot apply its server default (32k for K2.x, 131k for K3); if you set one, leave generous headroom for the answer. Moonshot's canonical field is `max_completion_tokens` (`max_tokens` is a deprecated alias) — the provider sends `max_completion_tokens` for `kimi-*` models whichever of the two you configure.
- **Controlling thinking.** The two generations use different, mutually exclusive controls:
  - The K3 series (`kimi-k3.1-pro`, `kimi-k3.1-pro-highspeed`, `kimi-k3`) is always thinking and accepts a top-level `reasoning_effort` field, which the provider forwards from `config.reasoning_effort`. Supported values are `low`, `high`, and `max` (the default). Moonshot documents the K2.x `thinking` parameter as unsupported on the K3 series, so don't send it there.
  - `kimi-k2.6` supports `thinking: { type: disabled }` (pass it via `config.passthrough`); `kimi-k2.7-code` is always thinking. The `thinking` parameter is K2.x-only.
  - Setting `config.reasoning_effort` on a non-K3 model is a configuration error and the provider fails fast with a clear message instead of sending it.

```yaml
providers:
  - id: moonshot:kimi-k3.1-pro
    config:
      showThinking: false
      reasoning_effort: max # optional: low, high, or max (default)
  - id: moonshot:kimi-k2.6
    config:
      passthrough:
        thinking: { type: disabled } # K2.x only: turn reasoning off
```

See the [Kimi K3.1 Pro quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart), the [model parameter reference](https://platform.kimi.ai/docs/api/models-overview), and [Thinking Models](https://platform.kimi.ai/docs/guide/use-thinking-models) for the full behavior matrix.

## Vision

The K3 series (`kimi-k3.1-pro`, `kimi-k3.1-pro-highspeed`, `kimi-k3`) and the K2 models (`kimi-k2.6`, `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`) accept base64-encoded image input using the standard OpenAI `image_url` content format. Moonshot does not accept remote image URLs — embed images as `data:` URIs or reference files uploaded to the Kimi platform as `ms://<file-id>`. The same models accept video input through `video_url`, referenced as `ms://<file-id>` after uploading via the files API. See [Use the Kimi Vision Model](https://platform.kimi.ai/docs/guide/use-kimi-vision-model).

## Example Usage

```yaml
providers:
  - id: moonshot:kimi-k3.1-pro
  - id: openai:gpt-4o-mini

prompts:
  - 'Summarize the following in one sentence: {{text}}'

tests:
  - vars:
      text: 'Promptfoo is an open-source tool for testing and evaluating LLM apps.'
```

A runnable comparison lives in [examples/provider-moonshot](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-moonshot).

## API Details

- Base URL: `https://api.moonshot.ai/v1` (global). China-mainland keys use `https://api.moonshot.cn/v1` — point at it with `apiBaseUrl`, since the global and China platforms issue region-locked keys.
- OpenAI-compatible chat completions API.
- Full [API documentation](https://platform.kimi.ai/docs/api/chat).

## See Also

- [OpenAI Provider](/docs/providers/openai/) — compatible configuration options
- [Kimi model list](https://platform.kimi.ai/docs/api/list-models) and [pricing](https://platform.kimi.ai/docs/pricing/chat)
