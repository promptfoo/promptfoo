---
sidebar_label: OrcaRouter
description: 'Access OpenAI, Anthropic, Google, DeepSeek, Grok, Qwen and more through OrcaRouter, an OpenAI-compatible adaptive routing gateway with per-workspace tunable strategies.'
---

# OrcaRouter

[OrcaRouter](https://www.orcarouter.ai/) is an OpenAI-compatible meta-router that provides a single endpoint for OpenAI, Anthropic, Google, DeepSeek, Grok, Qwen, MiniMax, Kimi, and other upstreams. It also offers an adaptive `orcarouter/auto` virtual router whose strategy (`cheapest`, `balanced`, `quality`, `adaptive`, `gated_adaptive`) is configured per workspace from the [routing console](https://www.orcarouter.ai/console/routing).

OrcaRouter follows the OpenAI API format — see the [OpenAI provider documentation](/docs/providers/openai/) for shared request semantics.

## Setup

1. Get your API key from [OrcaRouter](https://www.orcarouter.ai/).
2. Set the `ORCAROUTER_API_KEY` environment variable, or specify `apiKey` in your config.

## Popular models

OrcaRouter's full live catalog is at [orcarouter.ai/models](https://www.orcarouter.ai/models). A few common IDs:

| Model ID                        | Notes                                                                      |
| ------------------------------- | -------------------------------------------------------------------------- |
| `orcarouter/auto`               | Adaptive router — picks an upstream per request based on workspace policy. |
| `openai/gpt-5.5`                | OpenAI flagship.                                                           |
| `anthropic/claude-opus-4.7`     | Anthropic flagship (reasoning model — does not accept `temperature`).      |
| `google/gemini-3-flash-preview` | Google preview model.                                                      |
| `deepseek/deepseek-v4-pro`      | DeepSeek flagship.                                                         |
| `grok/grok-4.3`                 | xAI flagship.                                                              |
| `qwen/qwen3.6-flash`            | Alibaba Qwen flagship.                                                     |
| `minimax/minimax-m2.7`          | MiniMax flagship.                                                          |

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: orcarouter:openai/gpt-5.5
    config:
      temperature: 0.7
      max_tokens: 1000

  - id: orcarouter:anthropic/claude-opus-4.7
    config:
      max_tokens: 2000

  - id: orcarouter:auto
    config:
      max_tokens: 1000
```

If you route OrcaRouter traffic through a proxy or compatible gateway, set `apiBaseUrl` in the provider config. Precedence is `config.apiBaseUrl` → the hardcoded OrcaRouter default (`https://api.orcarouter.ai/v1`). The generic OpenAI base URL env vars are not consulted for this provider.

The same pattern applies to `apiKeyEnvar` — set it to read your API key from a custom environment variable name (default `ORCAROUTER_API_KEY`).

```yaml title="promptfooconfig.yaml"
providers:
  - id: orcarouter:openai/gpt-5.5
    config:
      apiBaseUrl: https://proxy.example.com/orcarouter/v1
      apiKeyEnvar: MY_PROXY_KEY # optional: read the Bearer token from $MY_PROXY_KEY
```

## Adaptive routing with `orcarouter/auto`

`orcarouter/auto` is a virtual router (not a model). OrcaRouter seeds each workspace with an `auto` router whose strategy and candidate model pool are configured in the [routing console](https://www.orcarouter.ai/console/routing). The same `/chat/completions` endpoint is used; OrcaRouter selects the upstream per request.

You can also pass a `models` fallback list and a `route` mode for hard-failover behavior:

```yaml title="promptfooconfig.yaml"
providers:
  - id: orcarouter:openai/gpt-5.5
    config:
      route: fallback
      models:
        - openai/gpt-5.5
        - anthropic/claude-opus-4.7
```

When `route: fallback` and the primary upstream errors out, OrcaRouter walks the `models` list in order.

## Thinking / Reasoning Models

Reasoning-capable models (Anthropic Claude Opus, OpenAI GPT-5 family, DeepSeek Reasoner, Gemini reasoning previews, etc.) may return a `reasoning` field alongside `content`. By default, promptfoo prefixes the reasoning content as `Thinking: ...\n\n<actual response>`. Hide it with `showThinking: false`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: orcarouter:anthropic/claude-opus-4.7
    config:
      showThinking: false # Hide thinking content from output (default: true)
```

:::note
Some reasoning models (`anthropic/claude-opus-4.7`, OpenAI `gpt-5*`, `deepseek/deepseek-reasoner`) reject `temperature`. Omit it for those models, or you will get a 400 from the upstream provider.
:::

## Features

- Access to OpenAI, Anthropic, Google, DeepSeek, Grok, Qwen, Kimi, MiniMax, and other upstream providers through one endpoint.
- Adaptive workload-aware routing via `orcarouter/auto` with strategies tunable from the console (no client redeploy required).
- Explicit fallback chains using `models` + `route: fallback`.
- OpenAI-compatible request/response format — works with all standard promptfoo features (assertions, multi-prompt, multimodal where the underlying model supports it).
