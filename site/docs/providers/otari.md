---
title: Otari
sidebar_label: Otari
sidebar_position: 60
description: "Use Promptfoo to evaluate models through Otari, Mozilla.ai's open-source LLM gateway, hosted on otari.ai or self-hosted, with the OpenAI provider and apiBaseUrl"
---

# Otari

[Otari](https://github.com/mozilla-ai/otari) is an open-source, OpenAI-compatible LLM gateway from Mozilla.ai that adds API keys, budgets, usage tracking, and routing in front of many model providers. Use the [OpenAI provider](/docs/providers/openai/) with `apiBaseUrl` set to the gateway's `/api/v1` root:

```yaml
providers:
  - id: openai:chat:openai:gpt-6.1-sol
    config:
      apiBaseUrl: '{{ env.OTARI_BASE_URL | default("https://api.otari.ai/api/v1") }}'
      apiKeyEnvar: OTARI_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
```

The default endpoint is Otari’s US gateway. For an EU account, set `OTARI_BASE_URL=https://eu.api.otari.ai/api/v1` as shown in the [Otari quickstart](https://docs.otari.ai/getting-started/quickstart). `omitDefaults: true` stops Promptfoo from adding its default `temperature` and output limit, which models such as GPT-6.1 Sol reject; Promptfoo cannot recognize the model behind an Otari ID like `openai:gpt-6.1-sol`. For a self-hosted gateway, set `OTARI_BASE_URL` to `https://<your-host>/api/v1`. The key in `OTARI_API_KEY` is sent as `Authorization: Bearer <key>`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

Everything after `openai:chat:` is passed to Otari unchanged as the model ID:

- `openai:chat:openai:gpt-6.1-sol` or `openai:chat:anthropic:claude-sonnet-5-5` pins a provider (`provider:model`)
- `openai:chat:openai/gpt-6.1-sol` lets otari.ai choose the provider
- `openai:chat:support-agent` uses an alias or routing policy defined on the gateway
