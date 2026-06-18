---
sidebar_label: Moonshot (Kimi)
description: Configure Moonshot AI's OpenAI-compatible API to evaluate Kimi K2 thinking, chat, and vision models with promptfoo
---

# Moonshot (Kimi)

[Moonshot AI](https://platform.kimi.ai/) provides an OpenAI-compatible API for its Kimi models — the Kimi K2 thinking models and the Moonshot v1 generation models. The Moonshot provider extends the [OpenAI provider](/docs/providers/openai/), so all of its options are supported.

## Setup

1. Get an API key from the [Kimi (Moonshot) platform](https://platform.kimi.ai/console/api-keys).
2. Set the `MOONSHOT_API_KEY` environment variable or specify `apiKey` in your config.

```yaml
providers:
  - id: moonshot:kimi-k2.6
```

Both `moonshot:<model>` and `moonshot:chat:<model>` resolve to the chat completions endpoint. If you omit the model, the provider defaults to `kimi-k2.6`.

## Available Models

Moonshot's lineup rotates over time — call the [list models API](https://platform.kimi.ai/docs/api/list-models) (`GET https://api.moonshot.ai/v1/models`) for the live set. As of writing:

- **Kimi K2 — thinking models, 256k context:** `kimi-k2.6`, `kimi-k2.5`, `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`. These reason before answering and emit a separate reasoning stream (see below).
- **Moonshot v1 — generation models:** `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k` (context-length variants), the vision variants `moonshot-v1-8k-vision-preview` / `moonshot-v1-32k-vision-preview` / `moonshot-v1-128k-vision-preview`, and the auto-router `moonshot-v1-auto`.

The older `kimi-k2-0711-preview`, `kimi-k2-0905-preview`, `kimi-k2-turbo-preview`, `kimi-k2-thinking`, `kimi-k2-thinking-turbo`, and `kimi-latest` ids were discontinued in 2026 — use `kimi-k2.6` instead.

## Configuration

```yaml
providers:
  - id: moonshot:kimi-k2.6 # flagship thinking model — leave sampling params unset
  - id: moonshot:moonshot-v1-8k # generation model — accepts arbitrary sampling
    config:
      temperature: 0.2
      max_tokens: 1024
```

### Configuration Options

The provider accepts every option the [OpenAI provider](/docs/providers/openai/) supports. Commonly used:

- `temperature`, `max_tokens`, `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `response_format` (JSON mode), `tools` / `tool_choice` (function calling)
- `showThinking` — set to `false` to drop a thinking model's reasoning from the graded output (default `true`)
- `cost`, `inputCost`, `outputCost`, `cacheReadCost` — Moonshot ships no built-in price table, so set these to track cost. Use Moonshot's pricing/billing docs (start at [Moonshot API docs](https://platform.kimi.ai/docs/api)) and your account billing page to find current per-model rates, including cached-token read pricing for `cacheReadCost`. `inputCost`/`outputCost` take precedence over the flat `cost`; `cacheReadCost` prices cached prompt tokens.

Any other parameter supported by the OpenAI provider is forwarded as-is.

## Kimi K2 thinking models

The `kimi-k2.x` models are reasoning models and behave differently from the `moonshot-v1` family:

- **Fixed sampling parameters.** Kimi pins `temperature` (`1.0` with thinking on), `top_p`, `n`, and the penalties to fixed values and returns a `400` ("invalid temperature: only 1 is allowed for this model") for any other value. The provider therefore does **not** send promptfoo's default `temperature`/`max_tokens` for `kimi-*` models — leave them unset (recommended) or set `temperature: 1`. The `moonshot-v1` models accept arbitrary sampling values.
- **Reasoning output.** Kimi returns a separate `reasoning_content` stream that promptfoo surfaces with a `Thinking: …` prefix. Set `showThinking: false` when you assert on structured output (for example `is-json`) so the reasoning doesn't contaminate the parsed result.
- **Token budget.** Reasoning tokens count against `max_tokens`. When you leave `max_tokens` unset the provider lets Moonshot apply its 32k default; if you set it, leave generous headroom for the answer.
- **Disable thinking.** `kimi-k2.6` and `kimi-k2.5` support `thinking: { type: disabled }` (pass it via `config.passthrough`); `kimi-k2.7-code` is always thinking.

```yaml
providers:
  - id: moonshot:kimi-k2.6
    config:
      showThinking: false
      passthrough:
        thinking: { type: disabled } # optional: turn reasoning off
```

See [Using Thinking Models](https://platform.kimi.ai/docs/guide/use-kimi-k2-thinking-model) for the full behavior matrix.

## Vision

The vision models (`moonshot-v1-*-vision-preview`) and the multimodal Kimi models (`kimi-k2.5` / `kimi-k2.6` / `kimi-k2.7-code`) accept base64-encoded image input using the standard OpenAI `image_url` content format. Moonshot does not accept remote image URLs — embed images as `data:` URIs. See [Use the Kimi Vision Model](https://platform.kimi.ai/docs/guide/use-kimi-vision-model).

## Example Usage

```yaml
providers:
  - id: moonshot:kimi-k2.6
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
