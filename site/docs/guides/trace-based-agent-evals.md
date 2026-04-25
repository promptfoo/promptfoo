---
title: 'Trace-Based Agent Evaluation: Tool-Call, Trajectory, and CI Assertions'
description: Evaluate AI agents on what they actually did — tool calls, retrieval steps, reasoning, and ordering — using OpenTelemetry traces in Promptfoo.
keywords:
  - agent evaluation
  - agent trajectory evaluation
  - tool-call accuracy
  - tool selection accuracy
  - LLM observability
  - OpenTelemetry
  - trace evaluation
  - LLM CI
image: /img/docs/tracing/trace-guide-results-overview.png
sidebar_position: 64
---

# Trace-Based Agent Evaluation

Agent evals often fail in the space between the prompt and the final answer. A support agent can say it looked up an order without calling the order API. A coding agent can say tests passed without running them. A RAG pipeline can answer correctly while silently skipping retrieval.

Tracing turns that hidden path into eval data. Promptfoo can receive OpenTelemetry spans, visualize them in the web UI, and use them in assertions. That lets you test both the final answer and the workflow that produced it.

![Promptfoo results table for a trace-backed RAG agent eval, showing 12 of 12 assertions passing across span counts, retrieval latency, tool sequence, reasoning steps, and a goal-success judge score](/img/docs/tracing/trace-guide-results-overview.png)

This guide shows how to:

- instrument an agent so its trace is useful for evals
- understand how Promptfoo turns spans into trajectory steps
- use raw trace assertions for span counts, latency, and errors
- use trajectory assertions for tool use, arguments, ordering, reasoning, and task success
- inspect the assertion output and Trace Timeline in the web UI
- design trace checks that stay stable as an agent evolves

## Why Evaluate Agent Trajectories, Not Just Final Answers

Modern agent observability tools are converging on the same pattern: keep the trace as the ground truth for what the agent did, then evaluate the trace instead of only evaluating the final message.

- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) model agent operations, tool execution, and handoffs as spans.
- [LangSmith](https://docs.langchain.com/langsmith/home) treats traces as the core debugging and evaluation artifact for LangChain and LangGraph apps.
- [DeepEval / Confident AI tracing](https://www.confident-ai.com/docs/llm-tracing/introduction) attaches metrics to traced components so you can evaluate internal steps.
- [MLflow GenAI evaluation](https://mlflow.org/docs/latest/genai/eval-monitor/running-evaluation/traces/) can run scorers over trace data, not just standalone inputs and outputs.

Promptfoo's angle is that these checks live in the same eval config as the rest of your regression suite. You can run them locally, in CI, against custom providers, and against agent SDKs that emit or forward OpenTelemetry spans.

## Raw Spans vs. Trajectory Steps

Trace-based evals have three layers:

| Layer                 | What it answers                                    | Promptfoo assertions                                                                                      |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Raw spans             | Did a named operation happen, fail, or run slowly? | `trace-span-count`, `trace-span-duration`, `trace-error-spans`                                            |
| Normalized trajectory | What did the agent do over time?                   | `trajectory:tool-used`, `trajectory:tool-args-match`, `trajectory:tool-sequence`, `trajectory:step-count` |
| Judged trajectory     | Did the traced workflow complete the goal?         | `trajectory:goal-success`                                                                                 |

Raw trace assertions are best for operational facts: span counts, error spans, and duration limits. Trajectory assertions are best for agent behavior: tool use, command execution, searches, reasoning steps, messages, and ordering. `trajectory:goal-success` is useful when the exact path can vary but the trace should still prove the task was completed.

A durable trace-backed eval usually uses both levels:

- a final-output assertion that checks the answer shown to the user
- raw trace assertions that prove required operations ran and stayed healthy
- trajectory assertions that prove the agent used the right tools, arguments, and order
- a model-graded trajectory assertion for the overall task when deterministic checks are too narrow

:::note How a traced row is evaluated under the hood
For each traced test row, Promptfoo runs the same loop:

1. Starts the OTLP receiver configured under `tracing`.
2. Creates a provider span and passes `traceparent` into the provider context.
3. Runs the provider or agent.
4. Receives provider, app, tool, command, retrieval, and reasoning spans.
5. Fetches the trace for trace-aware assertions.
6. Evaluates raw span assertions directly against span names, timing, status, and attributes.
7. Normalizes spans into a trajectory of steps and evaluates trajectory assertions against that step list.
8. Runs model-graded trajectory assertions as judge calls linked to the same trace.
9. Stores assertion reasons so failures explain which spans or steps matched.

Trace-based assertions are not a separate observability product bolted on after the run — they are part of the eval result. Pass/fail status, scores, reasons, and the trace UI all point at the same execution path.
:::

## Run The Example

The JavaScript OpenTelemetry example includes a traced RAG-style provider and a complete trace guide config:

```bash
npx promptfoo@latest init --example integration-opentelemetry/javascript
cd integration-opentelemetry/javascript
npm install
export OPENAI_API_KEY="your-api-key"
npx promptfoo@latest eval -c promptfooconfig.trace-guide.yaml --no-cache -o output.json
npx promptfoo@latest view
```

The example uses a simulated provider for the RAG workflow. It only needs `OPENAI_API_KEY` for the model-graded `trajectory:goal-success` assertion. If you want a fully offline run, remove that assertion and keep the deterministic trace and trajectory assertions.

Open the eval row, then switch between **Evaluation** and **Traces** in the details panel. The Evaluation tab shows which assertion passed and why:

![Evaluation tab showing raw trace assertions: rag_agent_workflow span count of 1, three retrieve_document_* spans, 95th-percentile retrieval latency under 350 ms, and zero error spans](/img/docs/tracing/trace-guide-assertions-raw.png)

Scroll further and you can see the trajectory assertions proving the behavioral path:

![Evaluation tab showing trajectory assertions: search_corpus tool used three times, compose_answer once, no issue_refund call, search_corpus arguments matched, search_corpus precedes compose_answer, four reasoning steps, and a goal-success judge score of 0.98](/img/docs/tracing/trace-guide-assertions-trajectory.png)

The Traces tab shows the timeline that powered those assertions:

![Trace timeline waterfall under the rag_agent_workflow root span: query_analysis, document_retrieval with three retrieve_document_* children, context_augmentation, reasoning_chain with three reasoning_* children, response_generation, and a grading span](/img/docs/tracing/trace-guide-timeline.png)

In the passing run above, Promptfoo verified:

- one root `rag_agent_workflow` span
- exactly three `retrieve_document_*` spans
- 95th percentile retrieval latency under 350 ms
- zero error spans
- three `search_corpus` tool calls
- one `compose_answer` tool call
- no `issue_refund` tool call
- the expected search query argument
- search before answer composition
- four reasoning steps (the parent `reasoning_chain` span plus three `reasoning_*` children — any span whose name starts with `reasoning` or `reasoning_` counts)
- overall traced task success with a judge score of `0.98`

Read the assertion reasons as a debugging contract:

- raw trace rows tell you which span names matched and what timing/error threshold was checked
- trajectory rows tell you which normalized steps matched, including tool aliases and captured arguments
- inverse trajectory rows tell you which forbidden behavior was absent
- `trajectory:goal-success` shows the goal template and the judge's trace-backed explanation

## Instrument Spans For Assertions

Promptfoo receives traces through its OTLP receiver. Enable tracing in your config:

```yaml title="promptfooconfig.yaml"
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      host: '127.0.0.1'
      port: 4318
      acceptFormats: ['json']
```

Promptfoo creates provider-level spans for supported built-in providers. To assert on internal agent behavior, your provider or app should also export child spans to `http://localhost:4318/v1/traces`.

For custom providers, Promptfoo passes a W3C `traceparent` in the provider context. Use it as the parent context for child spans so all telemetry appears under the same eval row. See [Tracing](/docs/tracing/) for JavaScript and Python setup examples.

Trajectory assertions work best when spans include stable names and common attributes. You do not need a Promptfoo-specific schema, but these attributes make traces easy to normalize:

| Behavior          | Helpful span data                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Tool call         | `tool.name`, `tool.arguments`, `tool.args`, `tool.input`, `function.name`, or `function.arguments` |
| Shell command     | `command`, `command.name`, `command_name`, or `codex.command`                                      |
| Search/retrieval  | `search.query`, `search_query`, `codex.search.query`, or a span name containing `search`           |
| Reasoning/message | Span names such as `reasoning`, `agent response`, or provider-native item types                    |
| Errors            | OTEL error status, `error`, `exception`, `failed`, or useful `status.message` attributes           |

Promptfoo normalizes spans into trajectory steps like this:

| Trajectory step type | How Promptfoo recognizes it                                                                                    | Good assertion fit                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `tool`               | `tool.name`, `function.name`, Vercel AI SDK tool-call attributes, or MCP span names                            | Required/forbidden tools and tool argument checks       |
| `command`            | `codex.command`, `command`, command-like attributes, `exec <command>` span names, or shell-like tool calls     | Coding-agent evals that must run tests or inspect files |
| `search`             | `search.query`, `search_query`, `codex.search.query`, or search/retrieve/lookup-like span names and attributes | RAG, web search, and retrieval fanout checks            |
| `reasoning`          | `reasoning` span names or provider-native reasoning item markers                                               | Agent planning/reasoning count checks                   |
| `message`            | Agent response/message spans such as `agent response` or `send input`                                          | Multi-turn agent message checks                         |
| `span`               | Any span that does not normalize into a more specific type                                                     | Temporary inspection or custom workflow checks          |

Each span normalizes into exactly one trajectory step. When attributes overlap, Promptfoo applies them in this priority order: shell-style tool calls become `command`, then any `tool.name` becomes `tool`, then a recognised command attribute becomes `command`, then a recognised search attribute becomes `search`, then reasoning, then message, otherwise `span`. So a retrieval span that sets both `tool.name: search_corpus` and `search.query: ...` normalizes to `tool`, not `search` — assert with `trajectory:tool-used` rather than `trajectory:step-count { type: search }` for that case.

"Shell-style" means `tool.name` matches one of `shell`, `exec_command`, or `local_shell` (case-insensitive). A tool you named `bash`, `terminal`, `run`, or anything else falls through to step type `tool` even when its arguments include a `cmd` field. Either rename the tool to one of the recognised shell names or assert with `trajectory:tool-used` instead of `trajectory:step-count { type: command }`.

Matchers use aliases, not just raw span names. For example, a span named `retrieve_document_0` with `tool.name: search_corpus` can match `trajectory:tool-used` as `search_corpus`, while still matching `trace-span-count` as `retrieve_document_*`.

Example tool span:

```javascript
const span = tracer.startSpan('tool search_corpus');

span.setAttributes({
  'tool.name': 'search_corpus',
  'tool.arguments': JSON.stringify({
    query: 'quantum computing classical computing',
    document_index: 0,
  }),
});
```

Keep span names boring and stable. Avoid generated IDs in names; put IDs in attributes if you need them. Avoid recording secrets, raw credentials, or large documents in attributes. Promptfoo sanitizes the GenAI request and response bodies it captures itself, but it does not redact attributes you attach to your own spans — the safest trace is one that never records secrets in the first place.

If your provider manually flushes OpenTelemetry, flush after the root span has ended. Flushing before `span.end()` can export child spans while omitting the parent span, which makes count and timeline assertions harder to reason about.

## Write A Complete Trace Eval

The example config combines output quality, raw trace checks, deterministic trajectory checks, an inverse trajectory check, and one model-graded trajectory check:

```yaml title="promptfooconfig.trace-guide.yaml"
description: Trace-based agent eval guide

prompts:
  - 'Explain how {{topic}} works in simple terms'

providers:
  - file://provider-simple-traced.js

tests:
  - description: RAG agent retrieves documents, reasons, and composes an answer
    vars:
      topic: quantum computing
    metadata:
      tracingEnabled: true
      testCaseId: trace-guide-rag-agent
    assert:
      - type: contains
        value: Based on my analysis of 3 technical documents

      - type: trace-span-count
        value:
          pattern: rag_agent_workflow
          min: 1
          max: 1

      - type: trace-span-count
        value:
          pattern: retrieve_document_*
          min: 3
          max: 3

      - type: trace-span-duration
        value:
          pattern: retrieve_document_*
          max: 350
          percentile: 95

      - type: trace-error-spans
        value:
          max_count: 0

      - type: trajectory:tool-used
        value:
          pattern: search_*
          min: 3
          max: 3

      - type: trajectory:tool-used
        value: compose_answer

      - type: not-trajectory:tool-used
        value: issue_refund

      - type: trajectory:tool-args-match
        value:
          name: search_corpus
          args:
            query: quantum computing classical computing
          mode: partial

      - type: trajectory:tool-sequence
        value:
          mode: in_order
          steps:
            - search_corpus
            - compose_answer

      - type: trajectory:step-count
        value:
          type: reasoning
          min: 4
          max: 4

      - type: trajectory:goal-success
        provider: openai:chat:gpt-5.4-mini
        value: The agent explained {{ topic }} using retrieved context, cited multiple documents, and composed a final answer after reasoning.

tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      host: '127.0.0.1'
      port: 4318
      acceptFormats: ['json']
```

Run with cache disabled while you are calibrating:

```bash
promptfoo eval -c promptfooconfig.trace-guide.yaml --no-cache -o output.json
```

Use `output.json` for assertion scores, reasons, provider output, token usage, and metadata. Use the web UI or trace API for full span inspection; the eval export keeps the assertion evidence but does not currently embed every raw span.

For local debugging, the trace API is useful when you need the complete span list:

```bash
curl http://localhost:15500/api/traces/evaluation/<eval-id>
```

## Assertion Matrix

Use this matrix when choosing an assertion:

| Assertion                        | Checks                                   | Value shape                                             | Common failure it catches                                 |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `trace-span-count`               | Raw span names and count bounds          | `{ pattern, min?, max? }`                               | Retrieval, guardrail, or root workflow span never ran     |
| `trace-span-duration`            | Raw span duration threshold              | `{ pattern?, max, percentile? }`                        | Slow retrieval, reranking, sandbox, or tool span          |
| `trace-error-spans`              | Raw span error status/attributes         | `{ pattern?, max_count?, max_percentage? }` or a number | Internal tool, HTTP, sandbox, or provider error           |
| `trajectory:tool-used`           | Required normalized tool steps           | string, string array, or `{ name/pattern, min?, max? }` | Agent skipped the required tool                           |
| `not-trajectory:tool-used`       | Forbidden normalized tool steps          | string, string array, or `{ name/pattern, min?, max? }` | Agent called an unsafe or irreversible tool               |
| `trajectory:tool-args-match`     | Required tool arguments                  | `{ name/pattern, args or arguments, mode? }`            | Agent used the right tool with the wrong ID/filter/query  |
| `not-trajectory:tool-args-match` | Forbidden tool arguments                 | `{ name/pattern, args or arguments, mode? }`            | Agent passed sensitive, unsafe, or wrong-tenant arguments |
| `trajectory:tool-sequence`       | Required tool ordering                   | array or `{ mode?: in_order or exact, steps }`          | Agent composed an answer before retrieval or validation   |
| `not-trajectory:tool-sequence`   | Forbidden tool ordering                  | array or `{ mode?: in_order or exact, steps }`          | Agent read sensitive data and then transmitted it         |
| `trajectory:step-count`          | Count of normalized steps by type/name   | `{ type?, name?, pattern?, min?, max? }`                | Agent skipped tests, over-searched, or never reasoned     |
| `not-trajectory:step-count`      | Forbidden count range                    | `{ type?, name?, pattern?, min?, max? }`                | Agent performed too many commands/searches/messages       |
| `trajectory:goal-success`        | Judge over final output plus trajectory  | string or `{ goal }`, with a `provider`                 | Path looked plausible but did not actually solve the task |
| `not-trajectory:goal-success`    | Judge that a prohibited goal did not run | string or `{ goal }`, with a `provider`                 | Agent successfully performed something it must not do     |

The raw trace assertions operate on spans. The trajectory assertions operate on normalized steps. If you are unsure which one to use, start with a raw `trace-span-count` to prove the span exists, then add a trajectory assertion once the span has stable tool, command, search, or reasoning semantics.

The matrix lists `not-` variants only for trajectory assertions. Raw trace assertions have no `not-` form: assert "this raw span must not occur" with `trace-span-count` value `{ pattern: <name>, max: 0 }`, and "no error spans" with `trace-error-spans` value `{ pattern: <name>, max_count: 0 }` (or the shorthand `value: 0`).

## Assertion Reference

### `trace-span-count`

Use `trace-span-count` when a named operation must happen a specific number of times.

```yaml
- type: trace-span-count
  value:
    pattern: retrieve_document_*
    min: 3
    max: 3
```

The `pattern` matches span names with wildcards. `min` and `max` are optional bounds. This is the best first assertion for a required retrieval step, tool wrapper, guardrail, sandbox execution, or workflow root span.

### `trace-span-duration`

Use `trace-span-duration` when matching spans must stay under a latency budget.

```yaml
- type: trace-span-duration
  value:
    pattern: retrieve_document_*
    max: 350
    percentile: 95
```

Without `percentile`, every matching span must be under `max` milliseconds. With `percentile`, Promptfoo computes a nearest-rank percentile (no interpolation): for N matching spans the cutoff is the value at index `⌈(p/100) × N⌉ − 1` of the sorted-ascending durations. With small N this collapses to a max check — `percentile: 95` over 3 spans returns the slowest of the three, identical to `max`. Use percentiles when matching spans aggregate to 20+ samples (typically across many test rows) and prefer `max` over a small fixed batch.

:::warning No-spans pass
If no spans match the pattern, `trace-span-duration` returns `pass: true` with no warning. A renamed span, a dropped flush, or a missing `trace-span-count` companion can silently mask a real regression. Pair duration with a presence check whenever the span must exist:

```yaml
- type: trace-span-count
  value:
    pattern: retrieve_document_*
    min: 1
- type: trace-span-duration
  value:
    pattern: retrieve_document_*
    max: 350
```

:::

### `trace-error-spans`

Use `trace-error-spans` as a default health gate for traced workflows.

```yaml
- type: trace-error-spans
  value:
    pattern: '*'
    max_count: 0
```

You can also use `max_percentage` for noisy systems, or a number shorthand such as `value: 0`. Promptfoo treats OTEL error status, HTTP status codes, error-like attributes, and error-like status messages as error signals.

:::warning No-spans pass
Like `trace-span-duration`, `trace-error-spans` returns `pass: true` when no spans match the pattern. The default `pattern: '*'` matches every span, so a missing trace (receiver bind failure, dropped flush, port conflict) makes the assertion pass for the wrong reason. Pair with a `trace-span-count` assertion on a known-required span name to catch missing traces.
:::

### `trajectory:tool-used`

Use `trajectory:tool-used` when a tool must be called. The value can be a string, a list of strings, or an object with `name` or `pattern` plus optional count bounds.

```yaml
- type: trajectory:tool-used
  value:
    pattern: search_*
    min: 3
    max: 3
```

Promptfoo normalizes tool steps from attributes such as `tool.name`, `function.name`, Vercel AI SDK tool-call attributes, and MCP span names. Use `not-trajectory:tool-used` for forbidden tools:

```yaml
- type: not-trajectory:tool-used
  value: issue_refund
```

This is useful for irreversible actions, unsafe MCP tools, direct database writes, or external side effects that should not happen in a test.

### `trajectory:tool-args-match`

Use `trajectory:tool-args-match` when the tool call is only correct with specific arguments.

```yaml
- type: trajectory:tool-args-match
  value:
    name: search_corpus
    args:
      query: quantum computing classical computing
    mode: partial
```

`mode: partial` checks that the expected object is a subset of the captured arguments. `mode: exact` requires deep equality. Use `partial` unless the full payload is part of the contract. Use `not-trajectory:tool-args-match` to forbid a sensitive or unsafe argument pattern.

### `trajectory:tool-sequence`

Use `trajectory:tool-sequence` when order matters.

```yaml
- type: trajectory:tool-sequence
  value:
    mode: in_order
    steps:
      - search_corpus
      - compose_answer
```

`mode: in_order` allows extra tool calls between expected steps. `mode: exact` requires the exact tool sequence. Prefer `in_order` for evolving agents and `exact` for tight regression tests. Use `not-trajectory:tool-sequence` to forbid dangerous sequences, such as `read_secret` followed by `send_email`.

### `trajectory:step-count`

Use `trajectory:step-count` when you care about a class of steps, not just tools.

```yaml
- type: trajectory:step-count
  value:
    type: reasoning
    min: 4
    max: 4
```

Supported step types are `tool`, `command`, `search`, `reasoning`, `message`, and `span`. You can also add `name` or `pattern`. This is useful for “ran at least one test command,” “did not perform more than two web searches,” “included reasoning spans,” or “kept tool fanout under control.” Use `not-trajectory:step-count` when a matching range itself is forbidden.

`reasoning` matching is name-based and uses `/^reasoning([_\s]|$)/i` (case-insensitive). The bare name `reasoning`, names starting with `reasoning_` (e.g. `reasoning_chain`, `reasoning_synthesize_answer`), and names starting with `reasoning ` followed by anything (e.g. `Reasoning step 1`) all match. Hyphenated names like `reasoning-chain` do not. Three semantic reasoning steps wrapped in one parent named `reasoning_chain` produce a count of four, not three. Either include the parent in your range or rename the wrapper to skip it.

### `trajectory:goal-success`

Use `trajectory:goal-success` when the whole trace should prove the task succeeded, but exact path checks would be too brittle.

```yaml
- type: trajectory:goal-success
  provider: openai:chat:gpt-5.4-mini
  value: The agent explained {{ topic }} using retrieved context, cited multiple documents, and composed a final answer after reasoning.
```

Promptfoo summarizes the trace trajectory and asks the judge whether the workflow and final output accomplished the goal. Use this for end-to-end task success, but pair it with deterministic assertions for critical operations. The judge is powerful for “did the agent actually solve the task?” and weaker for “did the agent call exactly this API with exactly this ID?” Use `not-trajectory:goal-success` when a traced workflow must not achieve a prohibited goal.

## Design Durable Trace Checks

Good trace assertions are specific about the risk and flexible about harmless implementation details.

- Start from failure modes: skipped retrieval, wrong tenant ID, unsafe tool, missing test command, slow reranker, or hidden internal error.
- Pair final-output assertions with trace assertions. The user-visible answer still matters.
- Assert required and forbidden behavior separately so failures are easy to debug.
- Match stable names and small argument subsets instead of full serialized payloads.
- Use `min` and `max` ranges for loops, retries, fanout, and agent autonomy.
- Use `trace-error-spans` as a default health gate on agent workflows.
- Pair `trace-span-count` with `trace-span-duration` when latency only matters if the operation actually ran.
- Prefer `trajectory:tool-sequence` with `in_order` unless extra tool calls are harmful.
- Use `trajectory:goal-success` for holistic task completion, not as a replacement for contract checks.
- Keep secrets out of span attributes; redaction is defense-in-depth, not a tracing strategy.

## Current Limits To Design Around

Trace-based evals are most reliable when you design for the current assertion surface:

- `trace-span-duration` and `trace-error-spans` pass when no spans match. Add `trace-span-count` when span presence is required.
- Use `trace-span-count` with `max: 0` to assert that a raw span did not occur; inverse `not-` forms are designed for trajectory assertions.
- `trajectory:tool-args-match` depends on captured structured arguments. Add `tool.arguments`, `tool.args`, or framework-specific tool-call argument attributes.
- Use stable literal expected arguments in structured examples. If you need row-specific values inside nested argument objects, verify the rendered assertion value in the assertion reason.
- `trajectory:goal-success` adds a judge model call, cost, latency, and nondeterminism. Keep it for high-level task success and use deterministic assertions for critical gates.
- Exported eval JSON includes assertion reasons and scores, but not every raw span. Inspect full traces in the web UI or through the trace API when debugging instrumentation.
- Trace schemas differ across frameworks. Normalize tool names, arguments, commands, searches, and reasoning spans explicitly when you own the instrumentation.

## Troubleshooting

If trajectory assertions say no trace data is available:

1. Confirm `tracing.enabled: true` and `tracing.otlp.http.enabled: true`.
2. Confirm your provider or target app exports to `http://localhost:4318/v1/traces`.
3. Confirm the provider parses or forwards Promptfoo's `traceparent`.
4. Confirm the OTLP format matches `acceptFormats`; JavaScript examples often use JSON, while Python examples commonly use protobuf.
5. Confirm provider-specific switches are enabled, such as Codex `enable_streaming`, Codex `deep_tracing`, or an OpenAI Agents tracing processor.
6. Confirm spans are flushed after their parent spans end.

If traces appear but trajectory assertions do not match:

- Check span names and attributes in the Traces tab of the result details panel.
- Add `tool.name` and `tool.arguments` for tool calls.
- Add `command` or `codex.command` for shell steps.
- Add `search.query` or a search-like span name for retrieval/search steps.
- Use `trajectory:step-count` with `type: span` temporarily to inspect what Promptfoo can see.
- Export results with `-o output.json` and inspect each component assertion reason for matched span names and arguments.

## Related Docs

- [Tracing](/docs/tracing/)
- [Deterministic assertions](/docs/configuration/expected-outputs/deterministic/)
- [Model-graded assertions](/docs/configuration/expected-outputs/model-graded/)
- [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents)
- [Evaluate OpenAI Agents Python SDK](/docs/guides/evaluate-openai-agents-python)
- [OpenTelemetry tracing example (JavaScript)](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry/javascript)
