---
title: The Grid AI
sidebar_label: The Grid AI
sidebar_position: 42
description: "Evaluate The Grid AI's capability-tier instruments with promptfoo through the OpenAI-compatible provider, with token budgets, credentials, and cost caveats."
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
      headers:
        OpenAI-Organization: ''
      max_tokens: 1024
      showThinking: false

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: Paris
```

:::tip Name the credential with `apiKeyEnvar`

With `apiKeyEnvar: THEGRID_API_KEY`, that is the only variable the provider reads for its key, so a missing key fails locally before any request instead of falling back to `OPENAI_API_KEY`.

The empty `OpenAI-Organization` header stops an `OPENAI_ORGANIZATION` set in your environment from being sent to `api.thegrid.ai`.

:::

## Credentials and endpoint

Export the key, and set `apiBaseUrl` on each Grid provider as shown above:

```bash
export THEGRID_API_KEY=<your-the-grid-key>
```

`apiBaseUrl` should be the `/v1` root; promptfoo appends `/chat/completions`.

Do not point `OPENAI_BASE_URL` at The Grid AI instead. It redirects every `openai:` provider in the run, and `OPENAI_API_HOST` or `OPENAI_API_BASE_URL` take precedence over it when set. Without a provider-level `apiBaseUrl`, requests go to `api.openai.com` with your Grid key.

## Choosing an instrument

`GET https://api.thegrid.ai/v1/models` returns the current list with context windows and capability flags.

| Instrument                                                                                                                                                | Use it for                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `text-standard`, `text-prime`, `text-max`                                                                                                                 | General generation, increasing quality and cost |
| `code-standard`, `code-prime`, `code-max`                                                                                                                 | Code reading and generation                     |
| `agent-standard`, `agent-prime`, `agent-max`                                                                                                              | Multi-step tool use                             |
| `bytedance-pro-latest`, `claude-opus-latest`, `deepseek-pro-latest`, `gemini-pro-latest`, `glm-latest`, `gpt-sol-latest`, `kimi-latest`, `minimax-latest` | One lab's current model (lab-pinned)            |

Lab-pinned instruments (the last row) restrict routing to one lab, but they are still moving targets: the underlying version changes when that lab ships a new model.

:::caution Not suitable for reproducible benchmarks

No Grid instrument is an immutable model id, and promptfoo cannot record which model served a request. `OpenAiChatCompletionProvider` discards the top-level `model` field from the response, so exported results carry the instrument name only.

If a published number has to be reproducible, evaluate against a provider that exposes an immutable, versioned model id. Use The Grid AI for application evals, regression suites and judges, where routing to a current model is the point.

:::

## Token budgets

Use `max_tokens`. Promptfoo only forwards `max_completion_tokens` for models it classifies as reasoning models, and Grid instrument names are not on that list, so a `max_completion_tokens` value would be dropped.

Instruments do reason before answering, and those reasoning tokens are billed and count against the output budget while never appearing in the response. A budget sized for the visible answer can therefore truncate it. Leave headroom.

When using The Grid AI as a judge, set `showThinking: false` so model-graded assertions parse only the final content:

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:text-prime
      config:
        apiBaseUrl: https://api.thegrid.ai/v1
        apiKeyEnvar: THEGRID_API_KEY
        headers:
          OpenAI-Organization: ''
        temperature: 0
        max_tokens: 4096
        showThinking: false
```

## Cost reporting

Promptfoo has no built-in rates for Grid instruments, so cost shows as unknown by default. Setting both `inputCost` and `outputCost` (per token) on the provider makes promptfoo report a cost:

```yaml
config:
  inputCost: 0.0000005
  outputCost: 0.000002
```

Treat that number as an estimate. The Grid AI is market-priced, so per-token rates move, and `/v1/models` can serve `"pricing": null` when the rate cache is cold. Use The Grid AI's own `GET /v1/usage` and `GET /v1/usage/summary` endpoints for actual spend.

## Troubleshooting

| Symptom                                       | Fix                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Promptfoo calls OpenAI instead of The Grid AI | Set `apiBaseUrl` on the provider. `OPENAI_API_HOST` and `OPENAI_API_BASE_URL` both take priority over `OPENAI_BASE_URL`. |
| Error that the API key is not set             | `THEGRID_API_KEY` is unset or blank. Export a real key.                                                                  |
| Empty or truncated output                     | Reasoning tokens consumed the budget. Raise `max_tokens`.                                                                |
| Judge returns `Could not extract JSON`        | Set `showThinking: false` on the judge provider.                                                                         |
| Cost shows as unknown                         | Expected without overrides; see Cost reporting above.                                                                    |

## See also

- [OpenAI provider](./openai.md) for the full set of supported parameters
- [The Grid AI documentation](https://thegrid.ai/docs)
