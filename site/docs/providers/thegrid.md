---
title: The Grid AI
sidebar_label: The Grid AI
sidebar_position: 42
description: "Evaluate The Grid AI's capability-tier instruments with promptfoo through the OpenAI-compatible provider, including budgets, credentials, and cost caveats."
---

# The Grid AI

[The Grid AI](https://thegrid.ai) is an inference marketplace that serves models from several labs behind one OpenAI-compatible API implementing `/v1/chat/completions` and `/v1/responses`. Promptfoo connects to it through the OpenAI provider by changing `apiBaseUrl`; there is no separate `thegrid:` provider.

Model names are **capability tiers** rather than a lab's model name. `text-standard`, `code-prime` and `agent-max` each route to a model that currently qualifies for that tier, so a config keeps working when the underlying model is replaced.

## Basic configuration

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

tests:
  - vars:
      question: 'A warehouse has 1,248 units, ships 288, receives 45, then ships 192. How many remain? Reply with the number only.'
    assert:
      - type: equals
        value: '813'
```

:::warning Use a Grid-specific credential

`apiKeyEnvar: THEGRID_API_KEY` selects only that environment variable. If it is missing or blank, promptfoo reports a missing-key error before sending a request, even when `OPENAI_API_KEY` is set.

:::

## Setting the endpoint by environment variable

`OPENAI_BASE_URL` works only when neither `OPENAI_API_HOST` nor `OPENAI_API_BASE_URL` is set; those environment variables take precedence. Setting `apiBaseUrl` on the provider is unambiguous and is the recommended form.

```bash
export THEGRID_API_KEY='your-the-grid-key'
```

`apiBaseUrl` should be the `/v1` root; promptfoo appends `/chat/completions`.

## Choosing an instrument

`GET https://api.thegrid.ai/v1/models` returns the current list with context windows and capability flags.

| Instrument                                   | Use it for                                      |
| -------------------------------------------- | ----------------------------------------------- |
| `text-standard`, `text-prime`, `text-max`    | General generation, increasing quality and cost |
| `code-standard`, `code-prime`, `code-max`    | Code reading and generation                     |
| `agent-standard`, `agent-prime`, `agent-max` | Multi-step tool use                             |

Lab-pinned instruments such as `claude-opus-latest` and `gemini-pro-latest` restrict routing to one lab, but they are still moving targets: the underlying version changes when that lab ships a new model.

:::warning Model versions can change

Capability tiers and lab-pinned `*-latest` instruments can change models over time. Promptfoo records the configured instrument name, but its generic chat provider does not preserve the response's top-level `model` field as result metadata.

If a published number has to be reproducible, evaluate against a provider that exposes an immutable, versioned model id. Use The Grid AI for application evals, regression suites and judges, where routing to a current model is the point.

:::

## Token budgets

Use `max_tokens`. Promptfoo only forwards `max_completion_tokens` for models it classifies as reasoning models, and Grid instrument names are not on that list, so a `max_completion_tokens` value would be dropped.

When the selected model uses reasoning, leave room in the output budget for those tokens as well as the visible answer. A budget sized only for the final answer may truncate it.

When using The Grid AI as a judge, set `showThinking: false` so model-graded assertions parse only the final content:

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

Promptfoo has no built-in prices for Grid instruments. You can supply `inputCost` and `outputCost` in USD per token to estimate cost for an unknown model name:

```yaml
config:
  # Illustrative rates only: $1 per million input tokens and $2 per million output tokens.
  inputCost: 0.000001
  outputCost: 0.000002
```

Supply both rates. Grid prices vary with the market, so these estimates are only as current as the rates you configure. Use The Grid AI's [`GET /v1/usage` and `GET /v1/usage/summary`](https://thegrid.ai/openapi.json) endpoints for actual spend.

## Troubleshooting

| Symptom                                        | Fix                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Promptfoo calls OpenAI instead of The Grid AI  | Set `apiBaseUrl` on the provider. `OPENAI_API_HOST` and `OPENAI_API_BASE_URL` both take priority over `OPENAI_BASE_URL`. |
| Missing-key error mentioning `THEGRID_API_KEY` | Export a nonempty `THEGRID_API_KEY` for your Grid account.                                                               |
| Empty or truncated output                      | Raise `max_tokens` if the output budget was exhausted.                                                                   |
| Judge returns `Could not extract JSON`         | Set `showThinking: false` on the judge provider.                                                                         |
| Cost shows as unknown                          | Configure both per-token rates for an estimate; use Grid usage receipts for actual spend.                                |

## See also

- [OpenAI provider](./openai.md) for the full set of supported parameters
- [The Grid AI documentation](https://thegrid.ai/docs)
