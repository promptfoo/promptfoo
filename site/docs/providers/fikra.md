---
sidebar_label: Fikra
description: "Access Fikra's OpenAI-compatible API for open-weight models (DeepSeek, GLM, Kimi, Qwen) in promptfoo"
---

# Fikra

[Fikra](https://fikraapi.co.ke/) is a hosted API for open-weight models with an OpenAI-compatible `/v1` interface. One API key covers models from DeepSeek, GLM, Kimi, Qwen, StepFun, and NVIDIA.

## Setup

1. Create an API key at [fikraapi.co.ke](https://fikraapi.co.ke/).
2. Set the `FIKRA_API_KEY` environment variable:

```sh
export FIKRA_API_KEY=fikra_...
```

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: fikra:deepseek-v4.1-flash
    config:
      temperature: 0.7
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

The provider's default `apiBaseUrl` is `https://api.fikraapi.co.ke/v1`; it can be overridden with `apiBaseUrl` in the provider config.

## Available Model IDs

Currently served lanes include `deepseek-v4.1-flash`, `glm-5.3-flash`, `kimi-k3`, `step-5-preview`, and `qwen3.8-27b`. See the [pricing page](https://fikraapi.co.ke/pricing) for the full list and per-token rates.

## Configuration Options

The provider accepts the standard [OpenAI chat options](/docs/providers/openai/).

## Additional Resources

- [Fikra docs](https://docs.fikraapi.co.ke)
- [Fikra pricing](https://fikraapi.co.ke/pricing)
