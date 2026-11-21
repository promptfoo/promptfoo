---
title: The Grid AI
sidebar_label: The Grid AI
sidebar_position: 42
description: "Evaluate The Grid AI's capability-tier instruments with promptfoo through the OpenAI-compatible provider, including budgets, credentials, and cost caveats."
---

# The Grid AI

[The Grid AI](https://thegrid.ai) routes requests to models from different labs. The model ID selects an **instrument**, such as the `text-standard` tier. Connect with the [OpenAI provider](./openai.md) and The Grid AI's API base URL.

## Basic configuration

Set `THEGRID_API_KEY` to your Grid API key. `apiKeyEnvar` selects only this credential. If the variable is missing or blank, the request fails before sending, even when `OPENAI_API_KEY` is set.

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{question}}'

providers:
  - id: openai:chat:text-standard
    label: The Grid AI text-standard
    config:
      apiBaseUrl: https://api.thegrid.ai/v1
      apiKeyEnvar: THEGRID_API_KEY
      max_tokens: 1024
      showThinking: false

tests:
  - vars:
      question: 'A warehouse has 1,248 units, ships 288, receives 45, then ships 192. How many remain? Reply with the number only.'
    assert:
      - type: regex
        value: '^\s*813\.?\s*$'
```

Set `apiBaseUrl` to the `/v1` root. Promptfoo appends `/chat/completions`. If you configure the endpoint through `OPENAI_BASE_URL`, check whether `OPENAI_API_HOST` or `OPENAI_API_BASE_URL` overrides it.

For a runnable comparison of two tiers, use the [example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-thegrid).

## Choosing an instrument

`GET https://api.thegrid.ai/v1/models` lists instrument IDs and basic metadata. See The Grid AI's [API specification](https://thegrid.ai/openapi.json) for the available fields.

| Instrument                                   | Use it for                  |
| -------------------------------------------- | --------------------------- |
| `text-standard`, `text-prime`, `text-max`    | General generation          |
| `code-standard`, `code-prime`, `code-max`    | Code reading and generation |
| `agent-standard`, `agent-prime`, `agent-max` | Multi-step tool use         |

:::warning Model versions can change

Tiers can route to different models over time. Instruments such as `claude-opus-latest` select a lab but can also change versions. Promptfoo records the configured instrument name. Its generic chat provider does not record the response's top-level `model` as result metadata. Use a versioned model ID when you need reproducible comparisons.

:::

## Token budgets and grading

Use `max_tokens`. For these instrument names, Promptfoo's chat provider omits `max_completion_tokens`. Reasoning and visible output may share the budget. Increase it if answers are truncated.

To use a Grid instrument as a judge, set `showThinking: false` so assertions parse only the final content.

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:text-prime
      config:
        apiBaseUrl: https://api.thegrid.ai/v1
        apiKeyEnvar: THEGRID_API_KEY
        temperature: 0
        max_tokens: 4096
        showThinking: false
```

## Cost reporting

Promptfoo has no built-in prices for Grid instruments. For an estimate, set both rates in USD per token.

```yaml
config:
  # Example rates of $1 per million input tokens and $2 per million output tokens
  inputCost: 0.000001
  outputCost: 0.000002
```

Prices vary. Check `GET /v1/usage` or `GET /v1/usage/summary` on The Grid AI for actual spending.

## See also

- [OpenAI provider](./openai.md) for the full set of supported parameters
- [The Grid AI documentation](https://thegrid.ai/docs)
