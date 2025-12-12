# LLM Tracing and Observability Research

This document captures research on the LLM tracing and observability landscape, including competitive analysis of open source and commercial offerings, and detailed feature patterns for building world-class tracing capabilities.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Competitive Landscape](#competitive-landscape)
  - [Open Standards and Instrumentation Layers](#1-open-standards-and-instrumentation-layers-oss)
  - [LLM-Native Tracing UIs](#2-llm-native-tracing-and-observability-uis-oss-and-open-core)
  - [General-Purpose Tracing Backends](#3-general-purpose-open-source-tracing-backends-otel-compatible)
  - [Commercial LLM Observability](#4-commercial-llm-observability)
  - [Gateways and Proxies](#5-gatewaysproxies-that-make-tracing-adoption-easy)
- [Feature Patterns and Requirements](#feature-patterns-and-requirements)
  - [Trace Model Architecture](#1-trace-model-that-matches-how-llm-apps-actually-run)
  - [Context Propagation](#2-context-propagation-across-boundaries)
  - [Integration Paths](#3-two-integration-paths-deep-sdk--zero-code-gateway)
  - [Provider Normalization](#4-normalization-across-providers-and-streaming)
  - [Privacy and Redaction](#5-privacy-redaction-and-text-storage)
  - [Sampling Strategies](#6-quality-aware-sampling)
  - [RAG Tracing](#7-rag-tracing)
  - [Evaluation Integration](#8-evaluation-woven-into-traces)
  - [Prompt Versioning](#9-prompt-and-config-versioning)
  - [Query and UI Patterns](#10-query-and-ui-patterns)
  - [LLM-Specific Alerting](#11-alerting-for-llm-specific-failure-modes)
  - [Extensibility](#12-extensibility)
- [What Makes an Excellent OSS Tracing Project](#what-a-very-good-open-source-llm-tracing-project-should-include)

---

## Executive Summary

LLM tracing is rapidly standardizing around **OpenTelemetry (OTel)**: instrument once, emit OTLP traces, and choose any backend or UI. OTel is vendor-neutral and OSS, and now includes GenAI semantic conventions (spans, attributes, events, metrics) so LLM requests, tool calls, token usage, etc. can be represented consistently across stacks.

The key insight is that teams want to avoid lock-in and reuse their existing observability infrastructure while getting LLM-specific capabilities that generic APM tools lack.

---

## Competitive Landscape

### 1. Open Standards and Instrumentation Layers (OSS)

These are the "plumbing" teams want to avoid lock-in and reuse their existing observability stack.

#### OpenTelemetry + Collector (OSS)

- **What it is**: Standard APIs/SDKs + the Collector as a vendor-agnostic pipeline to receive/process/export telemetry to one or more backends
- **Why it matters**: The foundation layer everything else builds on
- **Links**: [opentelemetry.io](https://opentelemetry.io)

#### OTel GenAI Semantic Conventions (OSS spec)

- **What it is**: Defines how to represent GenAI operations in telemetry (attributes, spans, events, metrics), including opt-in events for storing detailed prompt/history
- **Why it matters**: Standardizes how LLM operations are captured across all tools
- **Links**: [OTel GenAI Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

#### OpenLLMetry (OSS, Traceloop)

- **What it is**: LLM app tracing extensions built on top of OpenTelemetry, designed to be non-intrusive and exportable to existing tools (Datadog, Honeycomb, etc.)
- **Why people love it**: Works with your existing stack, no lock-in
- **Links**: [GitHub](https://github.com/traceloop/openllmetry), [traceloop.com](https://traceloop.com)

#### OpenInference (OSS, Arize)

- **What it is**: A conventions + plugins layer complementary to OTel for AI app tracing; designed to work with any OTel-compatible backend and is natively supported by Phoenix
- **Why people love it**: First-class RAG and agent support, Phoenix integration
- **Links**: [GitHub](https://github.com/Arize-ai/openinference)

---

### 2. LLM-Native Tracing and Observability UIs (OSS and Open-Core)

These tools provide first-class UI for agent traces, prompts, long text, and LLM-specific metrics that generic APM tools lack.

#### Arize Phoenix (OSS)

- **What it's for**: Experimentation, evaluation, troubleshooting, plus tracing for LLM/agent workflows
- **Why it's popular**: Explicitly positioned as open-source LLM tracing & eval, heavily anchored in OTel-style instrumentation
- **Key features**: Trace visualization, evaluations, RAG analysis, dataset management
- **Links**: [GitHub](https://github.com/Arize-ai/phoenix), [docs.arize.com/phoenix](https://docs.arize.com/phoenix)

#### Langfuse (OSS + Cloud)

- **What it's for**: Tracing, monitoring, evaluation, and debugging; self-hostable via Docker/K8s
- **Why people like it**: UI focuses on nested observations with inputs/outputs/timing/cost, "open source" with a path to managed
- **Key features**: Nested trace views, prompt management, cost tracking, evaluations
- **Links**: [GitHub](https://github.com/langfuse/langfuse), [langfuse.com](https://langfuse.com)

#### Helicone (OSS + Cloud)

- **What it's for**: "Proxy your LLM requests" style observability with usage, spend, latency; plus an OSS AI Gateway
- **Why people like it**: Minimal integration friction (often a URL or gateway change), lots of ops features adjacent to tracing
- **Key features**: Request logging, cost analytics, rate limiting, caching
- **Links**: [GitHub](https://github.com/Helicone/helicone), [helicone.ai](https://helicone.ai)

#### W&B Weave (OSS toolkit + W&B platform)

- **What it's for**: Observe/debug LLM apps and run evals with LLM judges/custom scorers
- **Why people like it**: Explicitly designed to handle long strings like docs/code in traces with good viewing ergonomics
- **Key features**: Long-text trace UX, evaluation framework, integration with W&B ecosystem
- **Links**: [docs.wandb.ai/weave](https://docs.wandb.ai/weave)

#### Opik by Comet (OSS)

- **What it's for**: Eval platform that also does "log traces & spans" and production observability
- **Why people like it**: Brings eval and tracing into one workflow (including table-based review flows)
- **Key features**: Combined eval/tracing, experiment tracking, annotation UI
- **Links**: [GitHub](https://github.com/comet-ml/opik), [comet.com/opik](https://www.comet.com/opik)

#### OpenLIT (OSS, OTel-native)

- **What it's for**: "OpenTelemetry-native" observability for LLMs/vector DBs and even GPUs, positioned as very low-lift instrumentation
- **Why people like it**: Native OTel integration, GPU monitoring, broad coverage
- **Links**: [GitHub](https://github.com/openlit/openlit), [openlit.io](https://openlit.io)

#### TruLens (OSS)

- **What it's for**: Evaluation + tracing for agents, including OTel-based tracing and "LLM-as-a-judge" style feedback; known for RAG-focused metrics like its "RAG Triad"
- **Why people like it**: Strong RAG evaluation framework, feedback functions
- **Key features**: RAG Triad (groundedness, relevance, answer quality), feedback functions
- **Links**: [GitHub](https://github.com/truera/trulens), [trulens.org](https://trulens.org)

#### Evidently (OSS + commercial)

- **What it's for**: Open-source "ML and LLM observability" with lots of metrics, testing, monitoring
- **Why people like it**: Strong drift detection, metrics library, dashboard generation
- **Links**: [GitHub](https://github.com/evidentlyai/evidently), [evidentlyai.com](https://evidentlyai.com)

#### WhyLabs LangKit / whylogs (OSS metrics tooling)

- **What it's for**: Open-source text metrics extraction to monitor LLM I/O, designed to work with whylogs
- **Note**: WhyLabs the company has announced it is discontinuing operations
- **Links**: [docs.whylabs.ai](https://docs.whylabs.ai)

---

### 3. General-Purpose Open Source Tracing Backends (OTel Compatible)

Many teams want LLM traces in the same place as everything else.

#### Jaeger (OSS)

- **What it's for**: Distributed tracing to monitor workflows, find bottlenecks, analyze dependencies
- **Why people love it**: Mature, battle-tested, great for microservices correlation
- **Links**: [jaegertracing.io](https://jaegertracing.io)

#### Zipkin (OSS)

- **What it's for**: Distributed tracing focused on timing/latency troubleshooting
- **Why people love it**: Simple, lightweight, well-understood
- **Links**: [zipkin.io](https://zipkin.io)

#### Grafana Tempo (OSS)

- **What it's for**: Distributed tracing backend, OTLP-friendly, integrates with logs/metrics (Grafana/Loki/Prometheus)
- **Why people love it**: Great Grafana integration, cost-effective storage
- **Links**: [grafana.com/oss/tempo](https://grafana.com/oss/tempo)

#### SigNoz (OSS)

- **What it's for**: OTel-native APM with distributed tracing UX (flamegraphs, gantt-style views)
- **Why people love it**: Full APM in one OSS package, good UX out of the box
- **Links**: [GitHub](https://github.com/SigNoz/signoz), [signoz.io](https://signoz.io)

---

### 4. Commercial LLM Observability

Usually bought when teams need managed scale, RBAC/audit, alerting, governance, and "quality/safety" features.

#### HoneyHive

- **What it's for**: Tracing + monitoring "purpose-built for agents", real-time metrics like latency/token/cost and KPI tracking
- **Differentiator**: Strong agent-focused UX, human feedback collection
- **Links**: [honeyhive.ai](https://honeyhive.ai)

#### LangSmith (LangChain)

- **What it's for**: Agent tracing plus monitoring/alerting/insights as a full platform workflow
- **Differentiator**: Tight LangChain integration, prompt hub
- **Links**: [langchain.com/langsmith](https://www.langchain.com/langsmith)

#### Traceloop (Platform)

- **What it's for**: Observability + evaluation for LLM outputs, built around OpenLLMetry
- **Differentiator**: Strong OTel foundation, evaluation confidence
- **Links**: [traceloop.com](https://traceloop.com)

#### Datadog LLM Observability

- **What it's for**: End-to-end tracing across agents with visibility into I/O, latency, token usage, errors; eval/security workflows
- **Differentiator**: Full APM correlation, enterprise features, OTel GenAI conventions support
- **Links**: [datadoghq.com](https://www.datadoghq.com/product/llm-observability/)

#### New Relic

- **What it's for**: OTel-based LLM observability through OpenLLMetry/OpenLIT integrations
- **Differentiator**: "Instant observability" quickstarts, existing APM correlation
- **Links**: [docs.newrelic.com](https://docs.newrelic.com/docs/ai-monitoring/intro-to-ai-monitoring/)

#### Dynatrace

- **What it's for**: "End-to-end observability for Agentic AI, Generative AI, and LLMs" with cost/perf focus
- **Differentiator**: Auto-instrumentation, enterprise scale
- **Links**: [dynatrace.com](https://www.dynatrace.com)

#### Splunk Observability for AI

- **What it's for**: Productized "observability for AI" messaging and guidance around LLM monitoring
- **Differentiator**: Enterprise ecosystem, SIEM correlation
- **Links**: [help.splunk.com](https://help.splunk.com)

#### Honeycomb

- **What it's for**: OTel ingestion and unified navigation across traces/logs/metrics
- **Differentiator**: High-cardinality debugging, BubbleUp analysis
- **Links**: [honeycomb.io](https://honeycomb.io)

#### Elastic Observability

- **What it's for**: OTel consolidation story (keep OTel semantics intact into Elasticsearch)
- **Differentiator**: Search-first analysis, existing Elastic ecosystem
- **Links**: [elastic.co](https://www.elastic.co/observability)

#### Fiddler

- **What it's for**: "LLMOps" framing with observability + guardrails, safety/faithfulness/PII themes
- **Differentiator**: Strong on trust/safety, model monitoring heritage
- **Links**: [fiddler.ai](https://fiddler.ai)

#### Arthur

- **What it's for**: Enterprise "observability" for ML and GenAI, plus an announced open-source real-time eval engine
- **Differentiator**: Enterprise governance, compliance focus
- **Links**: [arthur.ai](https://arthur.ai)

#### Galileo

- **What it's for**: Observability + evaluation platform focused on agent reliability
- **Differentiator**: Research-backed metrics, hallucination detection
- **Links**: [galileo.ai](https://www.galileo.ai)

---

### 5. Gateways/Proxies That Make Tracing Adoption Easy

These matter because they can centralize logging/tracing without touching every codepath.

#### Portkey (Commercial Gateway)

- **What it's for**: "OpenTelemetry-compliant" observability and trace grouping via trace IDs
- **Why it matters**: Gateway approach for fast adoption, built-in observability
- **Links**: [docs.portkey.ai](https://docs.portkey.ai)

#### LiteLLM Proxy (OSS)

- **What it's for**: Unified API for many providers and explicit guidance for "Tracing LLMs" via OpenTelemetry
- **Why it matters**: Provider normalization + tracing in one layer
- **Links**: [docs.litellm.ai](https://docs.litellm.ai)

#### Helicone AI Gateway (OSS)

- **What it's for**: Open-source gateway focused on routing/failover/caching plus observability
- **Why it matters**: Fast path to observability without code changes
- **Links**: [GitHub](https://github.com/Helicone/helicone)

---

## Feature Patterns and Requirements

### 1. Trace Model That Matches How LLM Apps Actually Run

**Pattern**: Treat an LLM interaction as a tree of spans (plus links), not a single log line.

#### Recommended Span Hierarchy (Agent Loop)

```
Root span: genai.session or agent.run
├── attributes: user.id, session.id, conversation.id, app.version, env, trace.hops
│
├── prompt.render (template + variables)
├── genai.request (actual call as sent to provider)
│   └── genai.stream (optional, for streaming tokens)
├── tool.call (one per tool invocation)
├── rag.retrieve (vector search)
│   └── rag.rerank (optional)
├── guardrail.input
├── guardrail.output
├── postprocess (formatting, parsing)
├── fallback (retry, model switch)
├── cache.get
└── cache.put
```

#### Why People Love It

You can answer "what happened?" in one glance:

- **Waterfall** tells you latency
- **Tree** tells you causality
- **Attributes** tell you "which model, which prompt, which user cohort"

#### Spans vs Events (This Matters)

| Use Spans For                        | Use Events For          |
| ------------------------------------ | ----------------------- |
| Things with duration and nested work | "Moments" inside a span |
| LLM calls, retrieval, tool calls     | Prompt truncated        |
| Operations you want to time          | Guardrail flagged       |
| Nested sub-operations                | Retry reason            |
|                                      | Tool response too large |

When people get this wrong, UIs get noisy or miss timing information.

---

### 2. Context Propagation Across Boundaries

**Pattern**: OTel trace context must follow the work across agents, async tasks, queues, and microservices.

#### What "Great" Does

- **W3C tracecontext** across HTTP boundaries, plus consistent propagation in async tasks (queues, background jobs)
- **Baggage** (or equivalent) for lightweight correlation keys that follow the trace:
  - `session.id`, `conversation.id`, `tenant.id`
  - Keep it small, never put PII or large values in baggage
- **Span links** for fan-out and "join later" patterns:
  - Retrieval done in parallel
  - Tool calls in parallel
  - Cache hits linking to the original computation span

#### Why People Love It

It turns "distributed" into "coherent". Without this, agent traces fracture into disconnected pieces.

---

### 3. Two Integration Paths: Deep SDK + Zero-Code Gateway

**Pattern**: Meet users where they are.

#### Path A: Deep SDK Instrumentation (Best Fidelity)

Captures semantic structure:

- Tool call boundaries
- RAG internals, reranking, chunk selection
- Prompt render variables vs final prompt

**Best for**: Teams building custom agent frameworks

#### Path B: Gateway/Proxy Capture (Fast Adoption)

You get 80% quickly:

- Request/response, latency, errors, tokens, cost
- Consistent provider normalization

**Best for**: "We have 12 services all calling LLMs, please stop the bleeding"

#### What "Very Good OSS" Does

Supports both and can correlate them:

- Gateway spans become the "outer" `genai.request`
- SDK adds nested spans for tool/RAG/guardrails

---

### 4. Normalization Across Providers and Streaming

**Pattern**: Unify different provider response formats into a stable schema.

#### Must Normalize

| Field                          | Description                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `model.name`, `model.provider` | Model identifier                                                              |
| Parameters                     | `temperature`, `top_p`, `max_tokens`, `seed`, function calling settings       |
| Token usage                    | `prompt_tokens`, `completion_tokens`, `total_tokens`, cache read/write tokens |
| Latency breakdown              | DNS, connect, provider queueing, application overhead (render, retrieval)     |

#### Streaming UX That Users Actually Want

For streaming output, don't just "store the final string".

**Metrics**:

- TTFT (time to first token)
- Tokens per second
- Stream interruptions, reconnects

**Events**:

- `stream.chunk` (optional sampling), or store chunks in a separate blob store
- Record "why it ended": stop reason, max tokens, tool call, safety stop

#### Why People Love It

Streaming failures and latency spikes are the #1 "this feels slow" complaints, and you cannot debug them from a single completion timestamp.

---

### 5. Privacy, Redaction, and Text Storage

**Pattern**: Prompts and responses are simultaneously the most valuable and most dangerous data you collect.

#### Storage Modes Per Field

A great system supports multiple modes:

| Mode          | Use Case                                                     |
| ------------- | ------------------------------------------------------------ |
| Full text     | Debug environments, short retention                          |
| Redacted text | PII removed                                                  |
| Hashed text   | Dedupe, similarity, regression detection without raw content |
| Metadata only | Lengths, token counts, language, classifier outputs          |

#### Where Redaction Should Happen

Ideally in a collector/pipeline processor so developers cannot accidentally bypass it.

**Rule types**:

- Regex, dictionary, structured JSON paths
- PII detectors (email, phone, SSN-like patterns)
- Allowlist "safe fields"

#### Trace-Level Access Control

- RBAC plus row-level security, tenant segregation
- Per-field masking in UI (developers can see structure, not content)

#### Why People Love It

Security teams stop blocking adoption. Product teams still get debugging value.

---

### 6. Quality-Aware Sampling

**Pattern**: You can't store everything at scale, but you also can't lose the interesting traces.

#### Types of Sampling

| Type                            | When to Use                                    |
| ------------------------------- | ---------------------------------------------- |
| Head sampling (decide at start) | Cheap, but might drop the only failing trace   |
| Tail sampling (decide after)    | Best for "keep 100% of errors and slow traces" |
| Dynamic sampling                | Adjust based on traffic, cost, model, tenant   |

#### "People Love It" Sampling Rules

Keep traces if any of these are true:

- Error status, retries, tool failures
- p95 or p99 latency bucket
- Cost above threshold
- Low user rating
- Low eval score (hallucination, groundedness, policy risk)

**Debug mode**: Sample 100% for a specific `user.id` or `session.id` for a limited time window so on-call can reproduce safely.

---

### 7. RAG Tracing

**Pattern**: An LLM answer is only as good as the context you fed it.

#### What to Capture Per Retrieval Span

| Field           | Details                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Query           | Text (or hash), embedding model                                                                                 |
| Vector store    | Name, collection, top_k, filters                                                                                |
| Returned chunks | Stable doc IDs, chunk IDs, scores, content fingerprints (hash), source pointers (URL, file path, datastore key) |
| Rerank results  | Pre and post rerank ordering                                                                                    |

#### The Killer UX Detail

Let users click from the final answer to:

- Which chunks were used
- Where in the prompt they appeared
- Whether the answer cited them

#### Why People Love It

This turns "hallucination debugging" from vibes into evidence.

---

### 8. Evaluation Woven Into Traces

**Pattern**: Tracing tells you "what happened", eval tells you "was it good".

#### Online Eval Inside Production Traces

Add an `eval.score` span (or events) that records:

- **Metrics**: groundedness, relevance, policy risk, refusal correctness
- **Judge model metadata**: model, version, or heuristic used
- **Thresholds** that triggered flags or fallbacks

Then power:

- Alerts on declining scores
- Cohort comparisons per model/prompt version

#### Offline Eval and Regression

Support datasets and replays:

- Pick a set of traces (or inputs) from production
- Replay on a new prompt/model
- Compute win rates and deltas: quality scores, latency, cost
- Gate merges in CI when regressions exceed thresholds

#### Why People Love It

It makes prompt iteration feel like software engineering, not "ship and pray".

---

### 9. Prompt and Config Versioning

**Pattern**: You can't debug or compare if you can't answer "which prompt version was this?"

#### Best Practice Fields

| Field                | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `prompt.template_id` | Identifies the prompt template                                    |
| `prompt.version`     | Specific version of the template                                  |
| `git.sha`            | Code version correlation                                          |
| `config.bundle_id`   | Agent configuration (tools enabled, retrieval params, guardrails) |

Store the "render inputs" separately from the final prompt:

- Variables: `{customer_name: ..., locale: ...}`
- Resulting prompt: "Dear ..."

#### UI Features People Obsess Over

- Prompt diff (template changes highlighted)
- Variable diff (what changed between two traces)
- "Show me all traces touched by prompt version X"

---

### 10. Query and UI Patterns

This is where a tool becomes sticky.

#### Exploration Primitives

**Filter by any attribute** (high-cardinality friendly):

- `model.name`, `prompt.version`, `tool.name`, `tenant.id`

**Saved views**:

- "High cost", "slow tool calls", "low score"

**Trace exemplar pinning**:

- Attach a trace to a ticket or incident

#### Compare Mode (The "Aha" Moment)

**Side-by-side traces**:

- Same input, different prompt/model
- Highlight which span changed latency or output

**Aggregate + drilldown**:

- "p95 latency up" -> click to see the top 10 traces contributing

#### Long-Text Viewing That Doesn't Hurt

- Folding, syntax highlight, JSON schema view
- "Copy rendered prompt"
- "Copy as curl" (repro)
- Show token-level segmentation if available (optional)

---

### 11. Alerting for LLM-Specific Failure Modes

**Pattern**: LLM apps fail in weird ways that aren't just "500 errors".

#### Great Alert Conditions

| Condition                                                | Why It Matters                   |
| -------------------------------------------------------- | -------------------------------- |
| Cost budget burn rate (per tenant, per route, per model) | Prevent bill shock               |
| Elevated retries, elevated tool timeouts                 | Early warning of provider issues |
| Spike in refusals, spike in empty answers                | Model behavior changes           |
| Quality score drift (rolling window)                     | Gradual degradation              |
| Retrieval dropouts (top_k returns empty more often)      | RAG health                       |

---

### 12. Extensibility

**Pattern**: Every serious team has a unique stack.

A great OSS project should let users:

- **Register new span types**: `tool.sql_query`, `tool.browser_search`, `guardrail.regex`
- **Attach custom evals**: Python scoring functions or external judge calls
- **Add derived attributes in the pipeline**: Example: bucket cost into `cost.tier`
- **Export data cleanly**: OTLP out, plus a stable query API so teams can build internal workflows

---

## What a "Very Good" Open Source LLM Tracing Project Should Include

If you want something that competes with the best, scope it like this:

### OTel-First, No Lock-In

- [ ] Native OTLP ingest and export
- [ ] First-class support for OTel GenAI conventions
- [ ] Collector-friendly pipelines (scrub, sample, route, multi-backend)

### LLM/Agent Trace UX That Beats Generic APM

- [ ] Tree + waterfall views for agent steps, tool calls, retrieval, rerank, final answer
- [ ] Long-text viewer with folding, diffing, JSON mode
- [ ] "Show me the exact prompt template + variables"
- [ ] Streaming metrics: TTFT, tokens/sec, partial outputs, retries, fallbacks

### LLM-Specific Metrics Baked Into the Trace

- [ ] Token usage, cost, model/provider, cache hits, latency breakdowns
- [ ] Prompt/response capture options: store, hash, or redact

### RAG-Native Tracing

- [ ] Retrieval spans with: query, embedding id, top-k docs/chunks, rerank scores, selected citations
- [ ] Vector DB spans and quality signals (context relevance / groundedness)

### Evaluation and Regression as First-Class Citizens

- [ ] Offline eval sets + CI regression: compare prompt/model versions
- [ ] "LLM-as-judge" and custom scorers
- [ ] Online eval rules tied to production traces (alerts when quality drifts)

### Feedback Loops

- [ ] Human annotation UI
- [ ] User thumbs up/down
- [ ] Link feedback to the exact trace + prompt version

### Governance and Privacy

- [ ] Field-level redaction, encryption at rest, retention policies
- [ ] Tenant isolation, RBAC, audit logs
- [ ] Configurable sampling strategies that understand LLM workloads

### Developer Ergonomics

- [ ] **Two integration paths**:
  - SDK/decorators for deep app traces (OpenLLMetry/OpenInference style)
  - Proxy/gateway capture for fast adoption (Helicone/LiteLLM/Portkey pattern)
- [ ] Great self-host: Docker Compose for local, Helm for prod, sane storage defaults

### Interoperability

- [ ] Import/export traces
- [ ] Link out to Jaeger/Tempo/Datadog/etc
- [ ] Stable query API so teams can build internal workflows

---

## Summary

Building this OSS project around **OTel compatibility + best-in-class agent trace UX + eval/regression** will match the "why people choose X" logic across Phoenix/Langfuse/Helicone/Weave, while still plugging cleanly into the Datadog/New Relic/Honeycomb world.

The key differentiators for winning in this space:

1. **OTel-native from day one** - no proprietary lock-in
2. **LLM-specific UX** - long text, streaming, RAG visibility
3. **Eval integration** - tracing alone isn't enough, you need quality signals
4. **Two integration paths** - meet developers where they are
5. **Enterprise-ready privacy** - or security teams will block adoption
