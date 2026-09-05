---
title: The Grid
sidebar_label: The Grid
description: "Evaluate The Grid's capability-tier instruments with promptfoo through the OpenAI-compatible provider, including token budgets, credentials, and cost caveats."
---

# The Grid

[The Grid](https://thegrid.ai) is an inference marketplace that serves models from several labs behind one OpenAI-compatible API implementing `/v1/chat/completions` and `/v1/responses`. Promptfoo connects to it through the OpenAI provider by changing `apiBaseUrl`; there is no separate `thegrid:` provider.

Model names are **capability tiers** rather than a lab's model name. `text-standard`, `code-prime` and `agent-max` each route to a model that currently qualifies for that tier, so a config keeps working when the underlying model is replaced.

## Basic configuration

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{question}}'

providers:
  - id: openai:chat:text-standard
    label: The Grid text-standard
    config:
      apiBaseUrl: https://api.thegrid.ai/v1
      apiKey: '{{env.THEGRID_API_KEY}}'
      max_tokens: 1024

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: Paris
```

:::warning Set `THEGRID_API_KEY` before running

If the key resolves to nothing and `OPENAI_API_KEY` is set, `OpenAiGenericProvider.getApiKey()` falls back to `OPENAI_API_KEY`, which would send your OpenAI credential to `api.thegrid.ai`. Confirm the variable is populated rather than relying on the eval to fail loudly.

:::

## Setting the endpoint by environment variable

`OPENAI_BASE_URL` works only when neither `OPENAI_API_HOST` nor `OPENAI_API_BASE_URL` is set; `getApiUrl` reads those two first. Setting `apiBaseUrl` on the provider is unambiguous and is the recommended form.

```bash
export THEGRID_API_KEY=<your-the-grid-key>
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

:::caution Not suitable for reproducible benchmarks

No Grid instrument is an immutable model id, and promptfoo cannot record which model served a request. `OpenAiChatCompletionProvider` discards the top-level `model` field from the response, so exported results carry the instrument name only.

If a published number has to be reproducible, evaluate against a provider that exposes an immutable, versioned model id. Use The Grid for application evals, regression suites and judges, where routing to a current model is the point.

:::

## Token budgets

Use `max_tokens`. Promptfoo only forwards `max_completion_tokens` for models it classifies as reasoning models, and Grid instrument names are not on that list, so a `max_completion_tokens` value would be dropped.

Instruments do reason before answering, and those reasoning tokens are billed and count against the output budget while never appearing in the response. A budget sized for the visible answer can therefore truncate it. Leave headroom.

When using The Grid as a judge, set `showThinking: false` so model-graded assertions parse only the final content:

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:text-prime
      config:
        apiBaseUrl: https://api.thegrid.ai/v1
        apiKey: '{{env.THEGRID_API_KEY}}'
        temperature: 0
        max_tokens: 4096
        showThinking: false
```

## Cost reporting

Promptfoo cannot report cost for Grid instruments. `calculateOpenAIUsageCost` looks up built-in rates by model name and returns `undefined` when there are none, before `inputCost` and `outputCost` overrides are consulted, so those options have no effect for these ids.

The Grid is market-priced and its `/v1/models` currently returns `"pricing": null`, so there is no static rate to add. Use The Grid's own `GET /v1/usage` and `GET /v1/usage/summary` endpoints for actual spend.

## Troubleshooting

| Symptom                                      | Fix                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Promptfoo calls OpenAI instead of The Grid   | Set `apiBaseUrl` on the provider. `OPENAI_API_HOST` and `OPENAI_API_BASE_URL` both take priority over `OPENAI_BASE_URL`. |
| Requests authenticate as your OpenAI account | `THEGRID_API_KEY` is unset and the provider fell back to `OPENAI_API_KEY`.                                               |
| Empty or truncated output                    | Reasoning tokens consumed the budget. Raise `max_tokens`.                                                                |
| Judge returns `Could not extract JSON`       | Set `showThinking: false` on the judge provider.                                                                         |
| Cost shows as unknown                        | Expected; see Cost reporting above.                                                                                      |

## See also

- [OpenAI provider](./openai.md) for the full set of supported parameters
- [The Grid documentation](https://thegrid.ai/docs)
