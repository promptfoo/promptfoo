---
title: 'Trace-Based Agent Evals: Tool Calls, Trajectories, and CI'
description: Evaluate agent outputs and OpenTelemetry traces with Promptfoo assertions for tools, ordering, latency, and errors.
keywords:
  - agent evaluation
  - OpenTelemetry
  - trace evaluation
slug: /guides/trace-based-agent-evals
sidebar_position: 64
---

# Trace-Based Agent Evals

A final answer can look right even when an agent skipped retrieval, used the wrong tool, or hid an internal failure. Promptfoo can receive OpenTelemetry spans and evaluate both the answer and the path that produced it.

| Need                        | Assertion                                                |
| --------------------------- | -------------------------------------------------------- |
| Required span count         | `trace-span-count`                                       |
| Latency or error budget     | `trace-span-duration`, `trace-error-spans`               |
| Required or forbidden tool  | `trajectory:tool-used`, `not-trajectory:tool-used`       |
| Arguments or order          | `trajectory:tool-args-match`, `trajectory:tool-sequence` |
| Step count or broad success | `trajectory:step-count`, `trajectory:goal-success`       |

## Run the example

The JavaScript OpenTelemetry example uses a local simulated provider:

```bash
npx promptfoo@latest init --example integration-opentelemetry/javascript
cd integration-opentelemetry/javascript
npm install
npx promptfoo@latest eval -c promptfooconfig.trajectory.yaml --no-cache -o output.json
```

The trace guide variant adds a model-graded assertion and needs `OPENAI_API_KEY`:

```bash
OPENAI_API_KEY="your-api-key" npx promptfoo@latest eval \
  -c promptfooconfig.trace-guide.yaml --no-cache -o output.json
```

Inspect `output.json` for row success, score, errors, and trace identifiers. Exported results can include trace spans and their attributes. Treat exported files and shared evals as sensitive when spans contain prompts, tool arguments, or user data.

## Instrument a provider

Enable the local receiver and fail loudly if its port cannot bind:

```yaml title="promptfooconfig.yaml"
tracing:
  enabled: true
  failOnReceiverStartFailure: true
  otlp:
    http:
      enabled: true
      host: '127.0.0.1'
      port: 4318
      acceptFormats: ['json']
      redactAttributes:
        - tool.arguments
        - password
        - authorization
        - secret
        - api_key
```

For a required trace, pair duration or error budgets with a presence check. Duration and error assertions can pass when no spans match.

```yaml
- type: trace-span-count
  value: { pattern: rag_agent_workflow, min: 1 }
- type: trace-span-duration
  value: { pattern: retrieve_document_*, max: 350, percentile: 95 }
- type: trace-error-spans
  value: { max_count: 0 }
```

Promptfoo passes a W3C `traceparent` to custom providers. Use it as the parent for child spans so the receiver can associate them with the eval row. Stable names plus `tool.name`, `function.name`, `command`, `codex.command`, `search.query`, and OTel error status make trajectory normalization useful.

Avoid recording full prompts, responses, credentials, or raw customer data. Receiver redaction is defense in depth; source redaction keeps sensitive values out of every collector.

## Write trajectory checks

```yaml
assert:
  - type: trace-span-count
    value: { pattern: retrieve_document_*, min: 3, max: 3 }
  - type: trajectory:tool-used
    value: { pattern: search_*, min: 3, max: 3 }
  - type: trajectory:tool-used
    value: compose_answer
  - type: not-trajectory:tool-used
    value: issue_refund
  - type: trajectory:tool-sequence
    value:
      mode: in_order
      steps: [search_corpus, compose_answer]
  - type: trajectory:step-count
    value: { type: reasoning, min: 1 }
```

The inverse tool assertion accepts a tool name, list, or an object with `name` or `pattern` and `max: 0`. It does not accept arbitrary positive count bounds.

Use `trajectory:tool-args-match` only for stable, relevant fields such as tenant or document IDs. Redacting a stored span attribute also removes the value available to the matcher.

`trajectory:goal-success` asks a model judge whether the output and summarized path achieved a goal. Pair it with deterministic checks for required operations, forbidden tools, and hard budgets.

## Retrieval quality

A trace proves retrieval ran; it does not prove the retrieved context was relevant or faithfully used. Pass the actual retrieved context to a RAG grader:

```yaml
tests:
  - vars:
      context: file://retrieved-context.txt
    assert:
      - type: context-faithfulness
        value: '{{ context }}'
```

Use `contextTransform` when the provider response carries retrieved documents. Keep trace checks alongside that grader to prove retrieval occurred.

## CI

Use an isolated config directory per job and fail if the receiver cannot start:

```yaml
permissions:
  actions: read

jobs:
  agent-eval:
    runs-on: ubuntu-latest
    env:
      PROMPTFOO_CONFIG_DIR: ${{ runner.temp }}/promptfoo
    steps:
      - uses: actions/checkout@v4
      - name: Run trace eval
        run: npx promptfoo eval -c promptfooconfig.yaml --no-cache -o eval-output.json
      - name: Download baseline
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh run list --workflow agent-eval.yml --branch main --status success --limit 1
```

Compare exported rows in a later CI step. A JavaScript assertion runs before row aggregation, so it cannot compare the current row's final aggregate or component scores.

For latency across runs, pool raw span durations from `.traces[].spans[]` before calculating p95. Comparing one already-aggregated percentile per row measures row statistics, not the percentile of all spans.

## Shared environments and retention

The receiver is unauthenticated HTTP. Keep `127.0.0.1` for one process or shared network namespace. A reverse proxy can secure ingress, but it does not isolate tenants that share one receiver and SQLite store. Use one `PROMPTFOO_CONFIG_DIR` per job or trust boundary, and expose a private service address only when another container or host must reach it.

Set retention for long-lived local stores:

```yaml
tracing:
  enabled: true
  storage:
    type: sqlite
    retentionDays: 30
```

## Practical checklist

- Require a root span before latency or error budgets.
- Use stable span names and tool identifiers.
- Redact at the source; treat exports and shares as sensitive.
- Prefer deterministic tool, sequence, and budget checks for CI.
- Use a model judge only for broad success criteria.
- Recalibrate exact counts and latency ranges as the agent changes.
