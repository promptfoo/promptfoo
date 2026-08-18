---
title: Tuning Engines Gateway
sidebar_label: Tuning Engines
sidebar_position: 48
description: 'Use Tuning Engines as an OpenAI-compatible gateway for governed model routing, access control, and usage-aware evaluations.'
---

# Tuning Engines

[Tuning Engines](https://app.tuningengines.com/docs/inference-api) exposes an OpenAI-compatible inference gateway for model routing, governed access, tenant-scoped inference keys, usage tracking, and agent/tool registry workflows.

Use promptfoo's OpenAI provider with `apiBaseUrl` pointed at the Tuning Engines gateway.

## Setup

1. Create a Tuning Engines inference key.
2. Set the `TUNING_ENGINES_API_KEY` environment variable.
3. Choose a model enabled for your tenant and permitted by your inference role. The example below uses the model name from the Tuning Engines quick start.

```bash
export TUNING_ENGINES_API_KEY="sk-te-..."
```

## Chat completions

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: openai:chat:llama-3.3-70b-fp8
    config:
      apiBaseUrl: https://api.tuningengines.com/v1
      apiKeyEnvar: TUNING_ENGINES_API_KEY
      temperature: 0.2
      max_tokens: 500

prompts:
  - 'Write a concise release note for: {{feature}}'

tests:
  - vars:
      feature: 'governed model routing'
```

Run the eval with your configured inference key:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

If your role does not allow `llama-3.3-70b-fp8`, replace it with a model enabled for your tenant.

## Compare enabled models

You can evaluate multiple enabled Tuning Engines models side by side, including models backed by different providers or routing policies. Replace the provider IDs below with names enabled for your tenant.

```yaml
providers:
  - id: openai:chat:your-fast-model
    label: tuning-engines-fast
    config:
      apiBaseUrl: https://api.tuningengines.com/v1
      apiKeyEnvar: TUNING_ENGINES_API_KEY

  - id: openai:chat:your-quality-model
    label: tuning-engines-quality
    config:
      apiBaseUrl: https://api.tuningengines.com/v1
      apiKeyEnvar: TUNING_ENGINES_API_KEY
```

## Notes

- Tuning Engines model availability is controlled by tenant catalog configuration and inference roles. The gateway exposes allowed models through `GET /v1/models`.
- If a requested model is restricted for a key or user, promptfoo receives the gateway's authorization error.
- For OpenAI-compatible behavior details, see the [OpenAI provider documentation](./openai.md).
