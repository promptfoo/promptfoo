---
title: Zhipu (GLM) Provider
sidebar_label: Zhipu (GLM)
description: Configure Zhipu AI's (Z.ai) OpenAI-compatible API to evaluate GLM-5.2 and GLM-4.6 models, with GLM-native reasoning control
---

# Zhipu (GLM)

[Zhipu AI](https://z.ai/) (**Z.ai**) provides an OpenAI-compatible API for its GLM family of language models. The Zhipu provider extends the [OpenAI chat provider](/docs/providers/openai/), so all of its chat completion options are supported.

## Setup

1. Get an API key from the [Z.ai platform](https://z.ai/) (international) or the [Zhipu open platform](https://open.bigmodel.cn/usercenter/apikeys) (China mainland).
2. Set the `ZHIPU_API_KEY` environment variable or specify `apiKey` in your config. The `ZAI_API_KEY` variable used by Z.ai's own OpenAI-SDK examples is also accepted.

```sh
export ZHIPU_API_KEY=your_api_key_here
# or, matching Z.ai's OpenAI-SDK docs:
export ZAI_API_KEY=your_api_key_here
```

Both `zhipu:<model>` and `zhipu:chat:<model>` resolve to the chat completions endpoint. If you omit the model, the provider defaults to `glm-5.2`.

This provider is chat-only. Z.ai also ships embedding (`embedding-3`), image (CogView), and other non-chat models, but those endpoints are not implemented here — a non-chat sub-type such as `zhipu:embedding:embedding-3` fails fast with an `Unsupported Zhipu sub-type` error rather than silently calling the chat API.

## Configuration

Basic configuration example:

```yaml
providers:
  - id: zhipu:glm-5.2
    config:
      temperature: 0.7
      max_tokens: 1024
  - id: zhipu:glm-4.6
    config:
      temperature: 0.2
```

### Configuration Options

- `temperature`, `max_tokens`, `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `showThinking` - Whether to include GLM reasoning content in the output (default: `true`). Display-only — it does not change whether the model reasons.
- `thinking` - GLM-native reasoning on/off toggle, e.g. `{ type: 'disabled' }`
- `reasoning_effort` - Reasoning budget for GLM-5.x, `"high"` or `"max"`
- `apiKey` / `apiKeyEnvar` - Provide the key inline or via a different environment variable
- `apiBaseUrl` - Override the endpoint (defaults to the international endpoint; see below)
- `cost`, `inputCost`, `outputCost`, `cacheReadCost` - Override promptfoo's pricing estimates (see [Cost Tracking](#cost-tracking))

## Content safety

Z.ai's safety filter is surfaced as a guardrail so `guardrails` assertions and red team runs can detect it: a blocked generation (`finish_reason: sensitive`) and a rejected request (error code `1301`) are both reported with `guardrails.flagged: true`.

## Reasoning (thinking mode)

GLM models reason by default. These three controls are independent:

- `thinking` turns reasoning on/off at the model.
- `reasoning_effort` sets how much it reasons (when on).
- `showThinking` only controls whether the reasoning text appears in the graded output.

```yaml
providers:
  # Stop the model from reasoning (saves tokens/latency):
  - id: zhipu:glm-5.2
    config:
      thinking:
        type: disabled
  # Keep reasoning but hide it from the output, with a larger budget:
  - id: zhipu:glm-5.2
    config:
      showThinking: false
      reasoning_effort: high # "high" or "max"
```

`reasoning_effort` only applies when reasoning is on; if `thinking` is disabled, the provider drops it so GLM never receives contradictory controls.

## Available Models

Model ids map directly to GLM model names:

- `glm-5.2` (default) - latest flagship
- `glm-4.5-flash` - fast, low-cost model for high-volume evals
- `glm-5`, `glm-4.6` - earlier generations

Model names rotate over time; if one returns a 404, pick a current id from the [GLM model list](https://docs.z.ai/guides/llm/glm-5.2).

## Cost Tracking

Per-eval cost is reported automatically from a built-in GLM price table ([Z.ai pricing](https://docs.z.ai/guides/overview/pricing)). To override it or price a model that isn't in the table, set `cost` (a flat per-token rate) or the more specific `inputCost` / `outputCost` (and optionally `cacheReadCost` for cached prompt tokens); these always take precedence over the table.

## Example Usage

See the [provider-zhipu example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-zhipu):

```sh
npx promptfoo@latest init --example provider-zhipu
```

## API Details

- Base URL: `https://api.z.ai/api/paas/v4` (international). China-mainland keys use `https://open.bigmodel.cn/api/paas/v4` — point at it with `apiBaseUrl`, since the two platforms issue region-locked keys.
- OpenAI-compatible chat completions API.
- Full [API documentation](https://docs.z.ai/).

## See Also

- [OpenAI Provider](/docs/providers/openai/) — compatible configuration options
- [GLM model list](https://docs.z.ai/guides/llm/glm-5.2)
