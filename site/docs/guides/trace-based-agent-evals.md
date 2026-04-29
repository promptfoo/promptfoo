---
title: 'Trace-Based Agent Evals: Tool Calls, Trajectories, and CI'
description: Evaluate AI agents on what they actually did — tool calls, retrieval, reasoning, and ordering — using OpenTelemetry traces in Promptfoo.
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
slug: /guides/trace-based-agent-evals
sidebar_position: 64
---

# Trace-Based Agent Evals

Agent evals often fail in the space between the prompt and the final answer. A support agent can say it looked up an order without calling the order API. A coding agent can say tests passed without running them. A RAG pipeline can answer correctly while silently skipping retrieval.

Tracing turns that hidden path into eval data. Promptfoo can receive OpenTelemetry spans, visualize them in the web UI, and use them in assertions. That lets you test both the final answer and the workflow that produced it.

![Promptfoo results table for a trace-backed RAG agent eval, showing 12 of 12 assertions passing across span counts, retrieval latency, tool sequence, reasoning steps, and a goal-success judge score](/img/docs/tracing/trace-guide-results-overview.png)

This guide shows how to:

- instrument an agent so its trace is useful for evals
- understand how Promptfoo turns spans into trajectory steps
- use raw trace assertions for span counts, latency, and errors
- use trajectory assertions for tool use, arguments, ordering, reasoning, and task success
- gate CI on tool-call accuracy, latency budgets, and cost
- handle multi-turn agents, parallel tool calls, retrieval quality, PII, and drift over time
- design trace checks that stay stable as an agent evolves

:::note Span 101: a 60-second primer
A **span** is one timed operation in a trace. It has a `name`, a `startTime` and (usually) an `endTime`, an OTel `status.code`, and a flat `attributes` map of strings, numbers, and booleans. Spans nest into a tree via `parentSpanId`, and the whole tree shares one `traceId`. We call the linearized step list derived from that tree the agent's **trajectory**.

A trace from one eval row of the example RAG agent looks like this (each indent is a parent → child relationship):

```text
rag_agent_workflow
├─ query_analysis                 attrs: {tokens.used: 120}
├─ document_retrieval
│  ├─ retrieve_document_0          attrs: {tool.name: search_corpus, tool.arguments: "..."}
│  ├─ retrieve_document_1          attrs: {tool.name: search_corpus, ...}
│  └─ retrieve_document_2          attrs: {tool.name: search_corpus, ...}
├─ context_augmentation            attrs: {augmentation.strategy: rerank_and_merge}
├─ reasoning_chain
│  ├─ reasoning_identify_key_concepts
│  ├─ reasoning_analyze_relationships
│  └─ reasoning_synthesize_answer
└─ response_generation              attrs: {tool.name: compose_answer}
```

Promptfoo asserts on this tree two ways: directly (`trace-span-*` over names, timing, and status) or after normalization into trajectory steps (`trajectory:*` over `tool` / `command` / `search` / `reasoning` / `message`). The W3C `traceparent` string (`00-<traceId>-<spanId>-<flags>`) is what stitches your provider's spans into Promptfoo's eval row: your provider reads it from the call context and uses it as the parent context for every span it emits.

If you have never instrumented anything before, jump straight to [Run the example](#run-the-example) and come back to the conceptual sections after you have seen a trace render.
:::

## Why evaluate agent trajectories, not just final answers

Modern agent observability tools are converging on the same pattern: keep the trace as the ground truth for what the agent did, then evaluate the trace instead of only evaluating the final message.

- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) model agent operations, tool execution, and handoffs as spans.
- [LangSmith](https://docs.langchain.com/langsmith/home) treats traces as the core debugging and evaluation artifact for LangChain and LangGraph apps.
- [DeepEval / Confident AI tracing](https://www.confident-ai.com/docs/llm-tracing/introduction) attaches metrics to traced components so you can evaluate internal steps.
- [MLflow GenAI evaluation](https://mlflow.org/docs/latest/genai/eval-monitor/running-evaluation/traces/) can run scorers over trace data, not just standalone inputs and outputs.

Promptfoo's angle is that these checks live in the same eval config as the rest of your regression suite. You can run them locally, in CI, against custom providers, and against agent SDKs that emit or forward OpenTelemetry spans.

## Raw spans vs. trajectory steps

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

## Run the example

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

:::note The example provider's body is hardcoded
The simulated provider always emits the same response body and the same `search_corpus` query so the deterministic `contains` and `trajectory:tool-args-match` assertions stay green across runs. Treat those two assertions as instructive shape, not as proof that the feature handles paraphrased queries — a real model will phrase `quantum computing classical computing` a dozen different ways. See [Anti-patterns](#anti-patterns) for how to assert on causally load-bearing arguments instead of free text.
:::

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
- four reasoning steps (the parent `reasoning_chain` span plus three `reasoning_*` children — see [`trajectory:step-count`](#trajectorystep-count) for the exact reasoning name match)
- overall traced task success with a judge score of `0.98`

Read the assertion reasons as a debugging contract:

- raw trace rows tell you which span names matched and what timing/error threshold was checked
- trajectory rows tell you which normalized steps matched, including tool aliases and captured arguments
- inverse trajectory rows tell you which forbidden behavior was absent
- `trajectory:goal-success` shows the goal template and the judge's trace-backed explanation

## Instrument spans for assertions

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

Each span normalizes into exactly one trajectory step. When attributes overlap, Promptfoo applies them in this priority order:

1. Shell-style tool calls become `command`.
2. Any `tool.name` becomes `tool`.
3. A recognised command attribute becomes `command`.
4. A recognised search attribute becomes `search`.
5. Reasoning span names become `reasoning`.
6. Agent message span names become `message`.
7. Anything else becomes `span`.

So a retrieval span that sets both `tool.name: search_corpus` and `search.query: ...` normalizes to `tool`, not `search`. Assert with `trajectory:tool-used` rather than `trajectory:step-count { type: search }` for that case.

"Shell-style" means `tool.name` matches one of `shell`, `exec_command`, or `local_shell` (case-insensitive). A tool you named `bash`, `terminal`, `run`, or anything else falls through to step type `tool` by default. Extend the recognised set in your config:

```yaml
tracing:
  enabled: true
  commandToolNames: [bash, terminal, run] # additive, case-insensitive
```

After the extension, spans with `tool.name: bash` (and a `cmd` argument) normalize to step type `command` and the executable becomes the step name. If you cannot or do not want to change config, assert with `trajectory:tool-used` instead of `trajectory:step-count { type: command }`.

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

## Write a complete trace eval

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

Use `output.json` for assertion scores, reasons, provider output, token usage, and metadata. Each row also includes `traceId` and `evaluationId` fields whenever tracing is enabled, which the trace API needs to look up raw spans:

```bash
# Pluck the failing row's traceId and evaluationId out of output.json
ROW=$(jq -r '.results.results[] | select(.success == false) | "\(.evaluationId) \(.traceId)"' output.json | head -1)
EVAL_ID=$(echo "$ROW" | cut -d' ' -f1)
TRACE_ID=$(echo "$ROW" | cut -d' ' -f2)

# Pull the full trace
curl "http://localhost:15500/api/traces/evaluation/$EVAL_ID" \
  | jq --arg tid "$TRACE_ID" '.traces[] | select(.traceId == $tid)'
```

## Assertion matrix

Use this matrix when choosing an assertion:

| Assertion                        | Checks                                   | Value shape                                              | Common failure it catches                                  |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `trace-span-count`               | Raw span names and count bounds          | `{ pattern, min?, max? }`                                | Retrieval, guardrail, or root workflow span never ran      |
| `trace-span-duration`            | Raw span duration threshold              | `{ pattern?, max, percentile? }`                         | Slow retrieval, reranking, sandbox, or tool span           |
| `trace-error-spans`              | Raw span error status/attributes         | `{ pattern?, max_count?, max_percentage? }` or a number  | Internal tool, HTTP, sandbox, or provider error            |
| `trajectory:tool-used`           | Required normalized tool steps           | string, string array, or `{ name/pattern, min?, max? }`  | Agent skipped the required tool                            |
| `not-trajectory:tool-used`       | Forbidden normalized tool steps          | string, string array, or `{ name/pattern, min?, max? }`  | Agent called an unsafe or irreversible tool                |
| `trajectory:tool-args-match`     | Required tool arguments                  | `{ name/pattern, args or arguments, mode? }`             | Agent used the right tool with the wrong ID/filter/query   |
| `not-trajectory:tool-args-match` | Forbidden tool arguments                 | `{ name/pattern, args or arguments, mode? }`             | Agent passed sensitive, unsafe, or wrong-tenant arguments  |
| `trajectory:tool-sequence`       | Required tool ordering                   | array or `{ mode?: in_order or exact, steps }`           | Agent composed an answer before retrieval or validation    |
| `not-trajectory:tool-sequence`   | Forbidden tool ordering                  | array or `{ mode?: in_order or exact, steps }`           | Agent read sensitive data and then transmitted it          |
| `trajectory:tool-set`            | Set membership (any-order tools)         | array or `{ tools, mode?: subset or exact }`             | Parallel agent missed a required tool in the fanout        |
| `not-trajectory:tool-set`        | Forbidden tool combination               | array or `{ tools, mode?: subset or exact }`             | A combination of tools that should never co-occur did      |
| `trajectory:step-count`          | Count of normalized steps by type/name   | `{ type?, name?, pattern?, min?, max? }`                 | Agent skipped tests, over-searched, or never reasoned      |
| `not-trajectory:step-count`      | Forbidden count range                    | `{ type?, name?, pattern?, min?, max? }`                 | Agent performed too many commands/searches/messages        |
| `trajectory:goal-success`        | Judge over final output plus trajectory  | string or `{ goal }`, with a `provider`                  | Path looked plausible but did not actually solve the task  |
| `not-trajectory:goal-success`    | Judge that a prohibited goal did not run | string or `{ goal }`, with a `provider`                  | Agent successfully performed something it must not do      |
| `tokens-used`                    | Token budget over trace or response      | `{ min?, max?, pattern?, source?: auto/trace/response }` | Runaway agent loop or unbounded fan-out blew the budget    |
| `not-tokens-used`                | Forbidden token-budget range             | same as `tokens-used`                                    | Stubbed provider returned 0 tokens when real work expected |

The raw trace assertions operate on spans. The trajectory assertions operate on normalized steps. If you are unsure which one to use, start with a raw `trace-span-count` to prove the span exists, then add a trajectory assertion once the span has stable tool, command, search, or reasoning semantics.

All trace and trajectory assertions accept a `not-` prefix that flips the result. The most common shapes:

- `not-trace-span-count` passes when the matched span count falls **outside** the `min`/`max` range (useful for "must not be exactly N"). For "must not occur at all" the simpler `trace-span-count` with `max: 0` is still preferred.
- `not-trace-error-spans` passes when the error budget was **not** met (i.e. errors are present). Useful in negative tests where you intentionally trigger a tool failure.
- `not-trace-span-duration` passes when at least one matching span exceeds the budget. Useful when proving that a slow path actually triggers your latency guardrail.

:::warning Inverse `trace-*` forms need a span to act on
For the no-match case, the inverse `trace-span-duration` and `trace-error-spans` assertions don't currently flip — when zero spans match the pattern they still report `pass: true`. Always pair these inverse forms with a `trace-span-count` presence check on a known span name so a missing trace can't silently satisfy an inverse assertion.
:::

## Assertion reference

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

Without `percentile`, every matching span must be under `max` milliseconds. With `percentile`, Promptfoo defaults to a nearest-rank percentile (no interpolation): for N matching spans the cutoff is the value at index `⌈(p/100) × N⌉ − 1` of the sorted-ascending durations. With small N this collapses to a max check — `percentile: 95` over 3 spans returns the slowest of the three, identical to `max`. Set `method: linear` to compute a linearly-interpolated percentile instead (NumPy `linear` / Excel `PERCENTILE.INC`):

```yaml
- type: trace-span-duration
  value:
    pattern: retrieve_document_*
    max: 350
    percentile: 95
    method: linear # NumPy-style interpolation; default is "nearest"
```

Promptfoo also appends a `warning: small sample N=<count>` note to the assertion reason whenever the percentile is computed over fewer than 20 samples, so the small-N footgun shows up in `output.json` and the UI without you having to remember it. Use percentiles when matching spans aggregate to 20+ samples (typically across many test rows) and prefer `max` over a small fixed batch.

:::warning No-spans pass
If no spans match the pattern, `trace-span-duration` returns `pass: true` by default. A renamed span, a dropped flush, or a missing `trace-span-count` companion can silently mask a real regression. Set `requirePresence: true` to fail when nothing matches, or pair duration with a separate `trace-span-count` assertion:

```yaml
- type: trace-span-duration
  value:
    pattern: retrieve_document_*
    max: 350
    requirePresence: true # fail if no retrieval spans were captured

# or, equivalently for older configs:
- type: trace-span-count
  value: { pattern: retrieve_document_*, min: 1 }
- type: trace-span-duration
  value: { pattern: retrieve_document_*, max: 350 }
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
Like `trace-span-duration`, `trace-error-spans` returns `pass: true` by default when no spans match the pattern. The default `pattern: '*'` matches every span, so a missing trace (receiver bind failure, dropped flush, port conflict) makes the assertion pass for the wrong reason. Set `requirePresence: true` to fail when nothing matches, or pair with a `trace-span-count` assertion on a known-required span name to catch missing traces.
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

When the captured arguments contain sensitive data (PII, tokens, internal identifiers), set `redactArgsInFailures: true` to replace the args with `[redacted]` in the assertion reason — preserving pass/fail signal while keeping full payloads out of `output.json`, the trace DB, and uploaded artefacts:

```yaml
- type: trajectory:tool-args-match
  value:
    name: lookup_user
    args: { tenant_id: '{{ user.tenant_id }}' }
    mode: partial
    redactArgsInFailures: true # never echoes captured args into the failure reason
```

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

Promptfoo summarizes the trace trajectory and asks the judge whether the workflow and final output accomplished the goal. Use this for end-to-end task success, but pair it with deterministic assertions for critical operations. The judge is powerful for "did the agent actually solve the task?" and weaker for "did the agent call exactly this API with exactly this ID?" Use `not-trajectory:goal-success` when a traced workflow must not achieve a prohibited goal.

:::warning What `trajectory:goal-success` cannot see
The judge receives a JSON summary of the trajectory truncated to roughly 24 steps (the first 12 plus the last 12 if the trace is longer), plus the final output and the rendered goal template. It cannot see:

- spans truncated by the head-and-tail summarizer in long agent runs
- redacted or dropped attribute values — the summary contains step `name` and status, not full `args`
- parallel branches that raced or duplicated work, since the summary serializes by start time
- silent failures inside tools that returned status 200 with empty bodies
- hallucinated citations when the cited IDs do not appear in any step name
- timing-based bugs where the steps are correct but the order at sub-millisecond resolution is wrong

For any of these, pair the judge with deterministic `trace-*` and `trajectory:*` assertions. The judge is at its best for "did the agent broadly accomplish the user's task?" and at its worst for "did this specific operation hit this specific argument?"
:::

## Retrieval evaluation: presence vs. quality

`trace-span-count` and `trajectory:tool-used` answer one question about a RAG pipeline: did retrieval _run_? They cannot answer whether retrieval _worked_. Treat the two as separate failure modes.

**Presence (deterministic).** The agent fired three `retrieve_document_*` spans, each via the `search_corpus` tool, with the expected query.

```yaml
- type: trace-span-count
  value: { pattern: retrieve_document_*, min: 1 }
- type: trajectory:tool-used
  value:
    pattern: search_corpus
    min: 1
- type: trajectory:tool-args-match
  value:
    name: search_corpus
    args: { tenant_id: '{{ user.tenant_id }}' }
    mode: partial
```

**Quality (judged or scored).** The retrieved documents were relevant, ranked by relevance, and the answer is faithful to them. Two patterns work today:

```yaml
# Pattern 1 — assert on numeric retrieval scores attached to spans.
# (Your provider sets retrieval.score on each retrieve_document_* span.)
- type: javascript
  value: |
    const scores = (context.trace?.spans || [])
      .filter((s) => s.name.startsWith('retrieve_document_'))
      .map((s) => Number(s.attributes?.['retrieval.score']))
      .filter(Number.isFinite);
    if (scores.length === 0) {
      return { pass: false, reason: 'no retrieval scores captured' };
    }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      pass: avg >= 0.7,
      score: avg,
      reason: `avg retrieval score ${avg.toFixed(2)} (threshold 0.70)`,
    };

# Pattern 2 — judge whether the answer is faithful to the cited documents.
- type: llm-rubric
  provider: openai:chat:gpt-5.4-mini
  value: The answer cites at least two of the retrieved documents and does not introduce facts that were not in the retrieval context.
```

For full retrieval-quality scoring (precision@k, recall, MRR, faithfulness), see the [RAG evaluation guide](/docs/guides/evaluate-rag) and combine its scorers with the trace-presence assertions above. Trace-based assertions tell you the retriever _ran_; RAG metrics tell you the retriever _was right_.

## Multi-turn and conversational traces

A trace from a single eval row covers one turn. Multi-turn agents add two requirements:

1. **Stitch turns into a session.** Set the OTel attribute `gen_ai.conversation.id` on every span emitted during the same conversation, and set the same value as `metadata.conversationId` on each test row. Promptfoo does not group rows by conversation in the UI today, but matching IDs let you reassemble a session in `output.json` (e.g. `jq 'group_by(.testCase.metadata.conversationId)'`) or in your trace backend.
2. **Assert per-turn and across turns.** Per-turn assertions live on each row as usual. Cross-turn assertions (e.g. "the agent never re-asks for the user's email") are most reliable when one row drives the full conversation in a single `callApi` invocation and emits one parent span per turn.

```yaml
tests:
  - description: 3-turn troubleshooting conversation
    vars:
      transcript: file://transcripts/wifi-issue.json
    metadata:
      tracingEnabled: true
      conversationId: wifi-issue
    assert:
      # Bound the turn budget.
      - type: trajectory:step-count
        value:
          type: message
          min: 3
          max: 6

      # Session-level forbidden behaviour.
      - type: not-trajectory:tool-used
        value: ask_for_email

      # Each tool call must stay scoped to the right tenant.
      - type: trajectory:tool-args-match
        value:
          name: lookup_account
          args: { tenant_id: '{{ user.tenant_id }}' }
          mode: partial

      # Holistic judge over the conversation.
      - type: trajectory:goal-success
        provider: openai:chat:gpt-5.4-mini
        value: The assistant resolved the WiFi issue without escalating to a human or re-asking for information already provided.
```

Tracking one conversation across multiple Promptfoo rows (one row per turn) is a useful pattern for production trace replay; today, asserting cross-turn behavior is most reliable inside one row.

## Parallel and concurrent tool calls

`trajectory:tool-sequence` walks the steps sorted by `startTime` and looks for a subsequence. It assumes serial execution. An agent that fires three searches concurrently still produces three spans, but the order between them is determined by start-time race and is not stable.

Three workable patterns:

**Pattern 1 — Anchor `in_order` on the serial parent.** If `compose_answer` runs after retrieval finishes, the sequence `[search_corpus, compose_answer]` is reliable: any of the parallel `search_corpus` spans satisfies the first step, and `compose_answer` happens after. Avoid asserting on the order _between_ the parallel calls.

**Pattern 2 — Use `trajectory:step-count` for cardinality without order.**

```yaml
- type: trajectory:step-count
  value:
    type: tool
    name: search_corpus
    min: 3
    max: 3
```

**Pattern 3 — Wrap parallel work in a serial parent span.** If your provider creates a `retrieval_fanout` parent around the parallel children, assert on the parent count instead of the children's order:

```yaml
- type: trace-span-count
  value: { pattern: retrieval_fanout, min: 1, max: 1 }
- type: trace-span-count
  value: { pattern: retrieve_document_*, min: 3, max: 3 }
```

**Pattern 4 — Use `trajectory:tool-set` for any-order set membership.** When order does not matter and you only care that the right tools fired, this is the cleanest assertion:

```yaml
- type: trajectory:tool-set
  value:
    tools: [search_corpus, rerank, fetch_document]
    mode: subset # default; pass an exact set to forbid extras
```

`mode: subset` (the default) requires every expected tool to appear at least once but allows extras. `mode: exact` additionally forbids any tool outside the set. Use the inverse `not-trajectory:tool-set` to assert that a forbidden combination of tools never fired together.

## CI gating, regressions, and cost budgets

Trace-based assertions exist to fail PRs cleanly. A few patterns make them production-grade in CI:

### Run trace evals in GitHub Actions

```yaml title=".github/workflows/agent-eval.yml"
name: Agent Eval

on:
  pull_request:
  push:
    branches: [main]

jobs:
  eval:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    concurrency:
      group: agent-eval-${{ github.ref }}
      # Don't cancel in-flight evals — let prior runs finish so artefacts upload
      # and pass-rate trends stay continuous. Set to `true` only if you're
      # comfortable losing data when commits land quickly.
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      # Linux-only pre-flight; ubuntu-latest runners include `ss`.
      # Replace with `lsof -nP -iTCP:4318` on macOS runners.
      - name: Verify port 4318 is free
        run: |
          if ss -lnt | grep -q ':4318 '; then
            echo "::error ::Port 4318 is in use; OTLP receiver will not start."
            exit 1
          fi
      - name: Run trace eval
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          PROMPTFOO_DISABLE_TELEMETRY: '1'
          # Fail the job if fewer than 95% of rows pass.
          PROMPTFOO_PASS_RATE_THRESHOLD: '95'
        run: |
          npx promptfoo eval \
            -c promptfooconfig.yaml \
            --no-cache \
            -o eval-output.json
      - name: Upload eval output
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-output-${{ github.run_id }}
          path: eval-output.json
```

The `concurrency` block prevents two CI runs on the same branch from racing for OTLP port 4318. For matrix builds on the same runner, set a unique port per job by reading `tracing.otlp.http.port` from a job-level env var. The pre-flight `ss -lnt` check fails fast if the port is occupied — without it, every trace assertion silently throws "No trace data available" and the row fails for the wrong reason.

Set `tracing.failOnReceiverStartFailure: true` in your config to make Promptfoo throw on bind failures instead of silently continuing. This converts a footgun (silent missing traces) into a loud, easy-to-diagnose error:

```yaml
tracing:
  enabled: true
  failOnReceiverStartFailure: true
  otlp:
    http: { enabled: true, port: 4318 }
```

### Time-box the judge

`trajectory:goal-success` makes one model call per row. If the judge stalls, the row stalls. Set `timeoutMs` on the assertion value — Promptfoo races the judge against the timer and fails the row with a clear reason if the judge does not return in time:

```yaml
- type: trajectory:goal-success
  provider: openai:chat:gpt-5.4-mini
  value:
    goal: The agent explained {{ topic }} using retrieved context.
    timeoutMs: 30000 # fail the row after 30s instead of stalling
```

For large suites, also keep judges off the deterministic critical path. Tag judge rows with metadata and run them in a separate job; gate merges on deterministic assertions only.

### Detect regressions across runs

Promptfoo does not currently produce a built-in run-vs-run diff. The pragmatic patterns:

- **Suite-level threshold.** Set `PROMPTFOO_PASS_RATE_THRESHOLD=95` (a percentage, not a fraction) so the CLI exits non-zero when row pass-rate drops below the threshold. Combine with `--share` to upload the run for human review when CI fails.
- **Pinned baseline.** Check a sanitized `expected.json` into the repo and add a `javascript` assertion that compares each row's `score` and per-component scores to the baseline, failing on regression beyond a tolerance.
- **Tagged artifacts.** Upload `eval-output.json` per commit (the workflow above does this), then compare PR vs base in a follow-up step with `jq`:

```bash
jq -r '.results.results[] |
  "\(.testCase.description // .testIdx)\t\(.success)\t\(.score)"' \
  pr-output.json > pr.tsv

diff <(sort base.tsv) <(sort pr.tsv) || true
```

### Cap cost per row

Agents that loop have unbounded cost. Use the built-in `tokens-used` assertion to enforce a budget per row directly from trace data (preferred) or the provider response:

```yaml
- type: tokens-used
  value:
    max: 10000 # fail the row if more than 10k tokens were spent
    pattern: '*' # optional; defaults to all spans
    source: auto # auto (default) | trace | response
```

`source: auto` sums any of `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.total_tokens`, and Promptfoo's own `tokens.used` it finds across matching spans, and falls back to `providerResponse.tokenUsage` when the trace yields zero. `source: trace` forces the trace path; `source: response` forces the provider-response path. The inverse `not-tokens-used` is occasionally useful when proving an agent _did_ spend tokens (e.g. a smoke test that detects a stubbed provider).

:::warning Don't mix aggregate and component token attributes on the same span
The summer reads every recognised key, so a span that records both the OTel-style component fields (`gen_ai.usage.input_tokens` + `gen_ai.usage.output_tokens`) **and** the aggregate (`gen_ai.usage.total_tokens`) is double-counted. Pick one shape per span — components or totals, not both — or use `source: response` for budget assertions.
:::

Pair this with a tool-call ceiling to detect runaway loops directly from the span tree:

```yaml
- type: trajectory:step-count
  value: { type: tool, max: 50 }
- type: trace-span-count
  value: { pattern: '*', max: 200 }
```

### Compare against the last main run

A common CI ask is "did this PR regress p95 latency vs main?" Today the cleanest route is two artefacts and a `jq`/`javascript` step. Run the eval on `main` nightly with the same config, store the artefact, then in PR runs compare. The snippet below regexes the duration out of the assertion `reason` field as a quick demo — for a durable check, prefer reading structured fields (`componentResults[i].score`, span events) instead of parsing prose:

```bash
# In PR job, fetch latest main artefact
gh run download -n eval-output-main -D ./baseline

# Then in a JS assertion or post-step:
node -e '
  const cur = require("./eval-output.json").results.results;
  const base = require("./baseline/eval-output.json").results.results;
  const dur = (rows) => rows.flatMap((r) =>
    (r.gradingResult?.componentResults ?? [])
      .filter((c) => c.assertion?.type === "trace-span-duration")
      .map((c) => Number((c.reason.match(/\((\d+)ms\)/) || [])[1]) || NaN));
  const p = (xs, q) => xs.sort((a, b) => a - b)[Math.ceil((q/100)*xs.length) - 1];
  const baseP95 = p(dur(base).filter(Number.isFinite), 95);
  const curP95 = p(dur(cur).filter(Number.isFinite), 95);
  if (curP95 > baseP95 * 1.20) {
    console.error(`p95 regressed: ${baseP95}ms -> ${curP95}ms`);
    process.exit(1);
  }
'
```

Keep the comparison logic in your CI workflow rather than in the eval config so the eval suite stays portable across machines and PRs.

## Handling PII in spans

Anything you put on a span travels to:

- Promptfoo's SQLite trace store (default `~/.promptfoo/promptfoo.db`)
- the Web UI Traces tab
- assertion failure reasons inside `output.json` — full `tool.arguments` JSON appears verbatim in `trajectory:tool-args-match` and `not-trajectory:tool-args-match` reasons
- any external trace backend you forward to from your own provider

Treat span attributes as you would log lines: redact at the source, not in the viewer.

**What Promptfoo redacts automatically.** Promptfoo's GenAI provider tracer sanitizes API-key-like and token-like patterns from the request and response bodies it captures itself. It does **not** redact attributes you attach to your own spans. Custom provider spans, OpenAI Agents SDK spans, and Codex item spans are stored as-emitted.

**Redact in your provider before calling `setAttributes`.**

```javascript
function redact(
  value,
  redactKeys = ['password', 'token', 'api_key', 'authorization', 'ssn', 'email'],
) {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const out = Array.isArray(value) ? [] : {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = redactKeys.some((rk) => k.toLowerCase().includes(rk))
      ? '[REDACTED]'
      : redact(v, redactKeys);
  }
  return out;
}

span.setAttributes({
  'tool.name': 'lookup_user',
  'tool.arguments': JSON.stringify(redact(args)),
});
```

Once the values are redacted, your `trajectory:tool-args-match` assertions need to assert on identifiers (tenant_id, user_id, document_id), not on the redacted fields. This is the right shape regardless: the identifiers are the causal contract; the free-text fields are evidence.

**Hardening checklist for shared environments.**

- Bind the OTLP receiver to `127.0.0.1` (the default). The receiver is designed for a single-machine eval environment and has no in-process auth, rate limiting, mTLS, or audit logging — those belong at a higher layer.
- For any non-loopback deployment (multi-tenant CI runners, sibling containers, public hosts), put a reverse proxy in front of the receiver. Run nginx, Caddy, or your service mesh to terminate TLS, enforce mTLS or OAuth, rate-limit by source, and forward authenticated traffic to `127.0.0.1:4318`. The proxy is the right boundary for those concerns; application-layer auth on a loopback-default service does not change the threat surface meaningfully.

- Use `tracing.otlp.http.redactAttributes` to redact sensitive attribute keys at the receiver, before they hit the SQLite store, the UI, or any forwarder. Substring match is case-insensitive:

  ```yaml
  tracing:
    otlp:
      http:
        redactAttributes:
          - tool.arguments
          - password
          - authorization
          - secret
          - api_key
  ```

  Spans arrive with the named keys replaced by `[REDACTED]` so the original values never reach disk. Use this as defense in depth — the safer move is to redact at the source in your provider.

- If your provider exports spans to an external trace backend in addition to Promptfoo, redact at the source. Promptfoo's receiver-side `redactAttributes` list applies only to what Promptfoo stores; it does not intercept spans your provider sends to a separate collector.
- Avoid recording full prompts and full responses on spans by default. The OTel GenAI semantic conventions treat `gen_ai.prompt` and `gen_ai.completion` as opt-in for the same reason.
- Never put live customer data, secrets, or auth headers in fixture configs that travel through the eval.
- If your eval database accumulates real production traces, set `PROMPTFOO_CONFIG_DIR` to an ephemeral path in CI so the SQLite file is scoped to the run and discarded with the runner.
- For long-running local installs, set `tracing.storage.retentionDays` to enforce automatic pruning. Promptfoo runs `deleteOldTraces` after the OTLP receiver starts and removes traces (and their cascaded spans) older than the configured window:

  ```yaml
  tracing:
    enabled: true
    storage:
      type: sqlite
      retentionDays: 30 # delete traces older than 30 days at every eval start
  ```

## Managing drift over time

A `min: 3, max: 3` retrieval count is right today and wrong tomorrow. Models change, tools are added, prompts evolve. Treat every numeric range and exact string match as a moving baseline.

**Ratchet, don't pin.** Start each new assertion with the loosest range that still catches the failure mode (`min: 1, max: 10`). Tighten only when a regression slips through.

**Tag assertions by strictness.** Use `metric` names so strict regression checks are distinguishable from advisory ones, then compute pass-rates per group:

```yaml
assert:
  - type: trace-span-count
    metric: strict.retrieval-presence
    value: { pattern: retrieve_document_*, min: 1 }

  - type: trace-span-duration
    metric: advisory.retrieval-latency
    value: { pattern: retrieve_document_*, max: 350 }
```

A failing `advisory.*` becomes a soft signal in dashboards rather than a CI blocker.

**Rebaseline on intentional changes.** When you switch the retriever from top-3 to top-5, update the assertion in the same PR that switches it. Reviewers should see both changes together — never silently relax bounds in a separate "flake fix" commit.

**Watch the assertion reasons over time.** Failing rows now report which spans matched (`Matched spans: retrieve_document_0, retrieve_document_1`). Diff the reasons across runs to spot drift even when the assertion still passes — retrieval going from 3 spans to 2 over many releases is a quiet regression that exact-match assertions catch and a `min: 1` assertion does not.

**Schedule a quarterly refresh.** Re-run the full trace suite against the current model, capture the actual span counts and latencies, and update bounds explicitly. Outdated assertions break trust in the suite faster than any false positive.

## Anti-patterns

A few common mistakes pass schema validation but undermine the eval. Watch for these:

**Asserting on free-text query strings.** A search agent might paraphrase `quantum computing classical computing` as `compare quantum and classical computing`. Both are correct; only the first matches `trajectory:tool-args-match`. Assert on causally load-bearing arguments (tenant_id, user_id, document_id, action_type) and treat free-text fields as evidence the model is responsive, not as a contract.

**Using `percentile: 95` on a small batch.** With three retrieval spans, p95 returns the slowest of three — identical to `max`. Aggregate latency assertions across many test rows or skip the percentile and use `max`.

**Using `mode: exact` on a reactive agent.** Real agents retry, branch, and self-correct. `mode: exact` on `trajectory:tool-sequence` fails the row whenever the model legitimately re-issues a search. Reserve `exact` for short safety-critical sequences (`verify_user → authorize → execute`) and use `in_order` everywhere else.

**Pinning `min: N, max: N` for tool fan-out.** A frozen exact count (`min: 3, max: 3`) fails the moment the model decides 2 documents suffice. Use a range (`min: 1, max: 5`) for evolving agents and reserve exact equality for product-spec'd contracts.

**Trusting `goal-success` as the only check.** The judge sees a _summarized_ trajectory plus the final output. It cannot see redacted PII inside arguments, parallel branches that race, silent-but-200 tool failures, truncated long traces, or hallucinated citations whose IDs aren't in the summary. Pair the judge with deterministic assertions for any operation that must be exactly right.

**Letting `trace-span-duration` and `trace-error-spans` no-op-pass.** Both pass when no spans match the pattern. Anchor each one to a presence check with `trace-span-count` whenever the span must exist.

**Recording free-form prompts and outputs as span attributes.** Span attributes travel to the trace DB, the UI, assertion failure reasons in `output.json`, and anywhere your provider forwards them. Treat them as log lines: redact at the source. See [Handling PII in spans](#handling-pii-in-spans).

## Design durable trace checks

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

## Current limits to design around

Trace-based evals are most reliable when you design for the current assertion surface:

- `trace-span-duration` and `trace-error-spans` pass when no spans match. Add `trace-span-count` when span presence is required.
- Inverse `not-trace-*` forms exist (see [Assertion matrix](#assertion-matrix)), but `not-trace-span-duration` and `not-trace-error-spans` don't currently flip in the no-match case. Pair inverse trace assertions with a `trace-span-count` presence check, or for a simple "must not occur" use `trace-span-count` with `max: 0`.
- `trajectory:tool-args-match` depends on captured structured arguments. Add `tool.arguments`, `tool.args`, or framework-specific tool-call argument attributes.
- Use stable literal expected arguments in structured examples. If you need row-specific values inside nested argument objects, verify the rendered assertion value in the assertion reason.
- `trajectory:goal-success` adds a judge model call, cost, latency, and nondeterminism. Keep it for high-level task success and use deterministic assertions for critical gates.
- Exported eval JSON includes assertion reasons, scores, `traceId`, and `evaluationId` per row, but not every raw span. Inspect full traces in the web UI or through the trace API when debugging instrumentation — see the curl recipe in [Write a complete trace eval](#write-a-complete-trace-eval).
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

## Next steps

Pick the path that matches what you want to do next:

**Run the working example in two minutes.**

```bash
npx promptfoo@latest init --example integration-opentelemetry/javascript
cd integration-opentelemetry/javascript
npm install
export OPENAI_API_KEY="sk-..."   # only needed for trajectory:goal-success
npx promptfoo@latest eval -c promptfooconfig.trace-guide.yaml --no-cache -o output.json
npx promptfoo@latest view
```

**Add tracing to a config you already have.** Drop the `tracing:` block from [Instrument spans for assertions](#instrument-spans-for-assertions) into your `promptfooconfig.yaml`, then start with one assertion:

```yaml
- type: trace-span-count
  value: { pattern: <one critical span name in your agent>, min: 1 }
```

Confirm the assertion fires by running the eval and checking the Traces tab. Then layer on `trajectory:tool-used` and `trajectory:tool-sequence` for behavior, `trace-span-duration` for latency, and `trajectory:goal-success` for end-to-end task success.

**Match the recipe to your stack.**

- Codex SDK / Codex CLI agents → [OpenAI Codex SDK provider](/docs/providers/openai-codex-sdk#tracing-and-observability)
- OpenAI Agents Python SDK → [Evaluate OpenAI Agents Python SDK](/docs/guides/evaluate-openai-agents-python)
- Custom JS or Python providers → [Tracing — Instrument Your Provider](/docs/tracing#2-instrument-your-provider)
- Coding agents that run shell commands → [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents)
- LangGraph apps → [Evaluate LangGraph](/docs/guides/evaluate-langgraph)
- RAG quality scoring on top of trace presence → [RAG evaluation](/docs/guides/evaluate-rag)
- Red-team coverage of forbidden tools and trajectories → [How to Red Team LLM Agents](/docs/red-team/llm-agents)

## Related docs

- [Tracing](/docs/tracing/) — full OTLP receiver setup, JS and Python provider examples, and forwarding to external backends
- [Deterministic assertions](/docs/configuration/expected-outputs/deterministic/) — non-trace assertions that pair with `trace-*` and `trajectory:*`
- [Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) — judge configuration shared with `trajectory:goal-success`
- [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents)
- [Evaluate OpenAI Agents Python SDK](/docs/guides/evaluate-openai-agents-python)
- [How to Red Team LLM Agents](/docs/red-team/llm-agents)
- [OpenTelemetry tracing example (JavaScript)](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry/javascript)
- [OpenTelemetry tracing example (Python)](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry/python)
