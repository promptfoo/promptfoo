---
title: Synap
sidebar_label: Synap
description: Configure Synap chat models in Promptfoo using the OpenAI-compatible provider, covering base URL, API key scoping, reasoning output, and rubric grading.
---

# Synap

[Synap](https://synap.linkrra.com) serves open-weight models through an [OpenAI-compatible API](https://synap.linkrra.com/docs). Use Promptfoo's [OpenAI provider](/docs/providers/openai/) with Synap's endpoint and API key.

Synap documents its data handling in its [privacy policy](https://synap.linkrra.com/privacy) and [terms of service](https://synap.linkrra.com/terms).

## Setup

Create a key on your [Synap account page](https://synap.linkrra.com/ai/account.html) — keys start with `sk-pool-` — and set `SYNAP_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:qwen3-coder-30b
    config:
      apiBaseUrl: https://synap.linkrra.com/v1
      apiKeyEnvar: SYNAP_API_KEY
      headers:
        OpenAI-Organization: ''
      temperature: 0
      max_tokens: 512
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `SYNAP_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- Set `max_tokens` to cap output. Promptfoo's default is 1024 unless you set `OPENAI_MAX_TOKENS` or `omitDefaults: true`.
- Some models, such as `gpt-oss-20b`, return reasoning in a separate field. Promptfoo prepends it to the answer as `Thinking: …`; set `showThinking: false` to keep it out of assertions.
- Synap has no embeddings endpoint, so [similarity assertions](/docs/configuration/expected-outputs/similar/) need an embedding provider elsewhere. `llm-rubric` and other model-graded assertions work against Synap by setting `defaultTest.options.provider`.

Check the [model catalog](https://synap.linkrra.com/models) for current model IDs and [pricing](https://synap.linkrra.com/pricing) for current rates. `GET https://synap.linkrra.com/v1/models` returns the same list with per-model prices and needs no API key.

## Free tier

`qwen3-coder-30b` is covered by Synap's [free tier](https://synap.linkrra.com/free.html) — 100,000 tokens and 50 requests a day per Google account, 4,096 output tokens per request, reset at 00:00 UTC. Other models answer `402` with a top-up link instead of billing a free key. The live limits are served at `GET https://synap.linkrra.com/api/account/free-tier`.

## Example

The [provider-synap example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-synap) compares two chat models and grades a rubric assertion with Synap using the same API key.
