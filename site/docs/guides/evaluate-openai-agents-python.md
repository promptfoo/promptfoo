---
title: Evaluate OpenAI Agents (Python SDK)
description: Evaluate the Python openai-agents SDK with Promptfoo tracing, tool-call assertions, and long-horizon task workflows.
sidebar_position: 26
---

# Evaluate OpenAI Agents (Python SDK)

Use the Python `openai-agents` SDK with Promptfoo by wrapping your agent as a Python provider. This gives you full control over agent code, tools, sessions, and framework-specific tracing, while still letting Promptfoo score outputs and assert on the traced workflow.

:::note
The built-in [`openai:agents:*` provider](/docs/providers/openai-agents) is for the JavaScript `@openai/agents` SDK. For the Python SDK, use the Python provider path described here.
:::

## Quick Start

```bash
npx promptfoo@latest init --example openai-agents
cd openai-agents

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export OPENAI_API_KEY=your_api_key_here

npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
PROMPTFOO_ENABLE_OTEL=true npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
npx promptfoo@latest view
```

## What The Example Covers

- multi-turn execution over a persistent `SQLiteSession`
- specialist handoffs between a triage agent, an FAQ agent, and a seat-booking agent
- Promptfoo trace ingestion of the SDK's internal spans
- assertions on tool usage, tool arguments, agent spans, tool order, and overall task success

## How The Tracing Works

Promptfoo can only assert on tool paths if it receives the agent's internal spans. The example does that by installing a custom `TracingProcessor` for the OpenAI Agents SDK and exporting those spans to Promptfoo's OTLP receiver.

At a high level:

1. Promptfoo enables tracing and injects a W3C `traceparent` into the Python provider context.
2. The example parses that trace context and configures a custom OpenAI Agents tracing processor.
3. The processor converts OpenAI Agents spans into OTLP JSON.
4. Promptfoo ingests those spans and makes them available in the Trace Timeline and `trajectory:*` assertions.

If you skip this exporter, Promptfoo will not see the SDK's tool and handoff spans, so `trajectory:*` assertions will not have the trace data they need.

If you also enable Promptfoo's Python wrapper OTEL path with `PROMPTFOO_ENABLE_OTEL=true`, the example will emit a provider-level Python span as well. The custom SDK spans will inherit that active OTEL span as their parent. The example config accepts both OTLP JSON and protobuf because the SDK bridge emits JSON while the wrapper exporter uses protobuf by default.

## Assertion Pattern

The example config asserts on the agent's actual behavior instead of only the final message:

```yaml
vars:
  steps_json: |
    [
      "My name is Ada Lovelace and my confirmation number is ABC123.",
      "Move me to seat 14C.",
      "Also, what is the baggage allowance?"
    ]

assert:
  - type: trajectory:tool-used
    value:
      - lookup_reservation
      - update_seat
      - faq_lookup

  - type: trajectory:tool-args-match
    value:
      name: update_seat
      args:
        confirmation_number: ABC123
        new_seat: 14C
      mode: partial

  - type: trajectory:tool-sequence
    value:
      steps:
        - lookup_reservation
        - update_seat
        - faq_lookup

  - type: trajectory:step-count
    value:
      type: span
      pattern: 'agent *'
      min: 3

  - type: trace-error-spans
    value:
      max_count: 0
```

Use `trajectory:goal-success` when you want a judge model to decide whether the traced workflow actually completed the task, not just whether it hit the right tool path.

## Long-Horizon Tasks

The example turns one eval row into a long-horizon task by passing a JSON-encoded list of user turns in `vars.steps_json`. The provider parses that JSON and executes the turns sequentially against a shared `SQLiteSession`, which lets the SDK preserve working memory across turns inside a single Promptfoo test case.

That pattern is useful when you want to evaluate:

- multi-step workflows that need memory
- agent handoffs over time
- task completion after several intermediate actions
- regressions in tool usage across longer trajectories

## Telemetry

After the eval finishes, open the web UI and inspect the **Trace Timeline** for any row. You should see:

- a provider-level Python span when `PROMPTFOO_ENABLE_OTEL=true`
- agent spans
- handoff spans
- generation spans
- function-tool spans with tool names and arguments

That same trace data powers `trace-span-*` and `trajectory:*` assertions.

## Related Docs

- [Python Provider](/docs/providers/python)
- [Tracing](/docs/tracing)
- [OpenAI Agents (JavaScript SDK)](/docs/providers/openai-agents)
