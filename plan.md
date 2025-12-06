# OpenTelemetry SDK Integration Plan

## Implementation Status

> **Status: Phase 1-4 Complete (Core Infrastructure + Provider Instrumentation + Migration Layer)**
>
> Last updated: December 2024

### Completed

- [x] **Core Infrastructure (Phase 1)**
  - [x] `src/tracing/otelConfig.ts` - Configuration management
  - [x] `src/tracing/otelSdk.ts` - OTEL SDK initialization
  - [x] `src/tracing/localSpanExporter.ts` - Local TraceStore export
  - [x] `src/tracing/genaiTracer.ts` - GenAI semantic conventions wrapper

- [x] **Unit Tests for Core Infrastructure**
  - [x] `test/tracing/otelConfig.test.ts` - 8 tests
  - [x] `test/tracing/otelSdk.test.ts` - 21 tests
  - [x] `test/tracing/localSpanExporter.test.ts` - 28 tests
  - [x] `test/tracing/genaiTracer.test.ts` - 43 tests

- [x] **Provider Instrumentation (Phase 2 - Category A)**
  - [x] OpenAI Chat (`src/providers/openai/chat.ts`)
  - [x] Anthropic Messages (`src/providers/anthropic/messages.ts`)
  - [x] Azure Chat (`src/providers/azure/chat.ts`)
  - [x] Bedrock Converse (`src/providers/bedrock/converse.ts`)

- [x] **Category B Provider Verification**
  - [x] Verified providers extending OpenAI inherit instrumentation (Deepseek, Perplexity, Alibaba, Cerebras, Databricks, Portkey, etc.)

- [x] **Integration Tests**
  - [x] `test/integration/tracing.test.ts` - 8 end-to-end tests

- [x] **Documentation**
  - [x] Updated `site/docs/tracing.md` with built-in provider instrumentation section

- [x] **Phase 3: Migration from TokenUsageTracker**
  - [x] Add deprecation notice to TokenUsageTracker (`src/util/tokenUsage.ts`)
  - [x] Create compatibility layer (`src/util/tokenUsageCompat.ts`)
  - [x] Unit tests for compatibility layer (`test/util/tokenUsageCompat.test.ts` - 22 tests)

- [x] **Phase 4: Additional Provider Instrumentation**
  - [x] HTTP provider (`src/providers/http.ts`)
  - [x] Ollama provider (`src/providers/ollama.ts` - completion + chat)
  - [x] Mistral provider (`src/providers/mistral.ts`)
  - [x] Replicate provider (`src/providers/replicate.ts`)
  - [x] OpenRouter provider (`src/providers/openrouter.ts`)
  - [x] Vertex provider (`src/providers/google/vertex.ts`)
  - [x] Watsonx provider (`src/providers/watsonx.ts`)
  - [x] Cohere provider (`src/providers/cohere.ts`)
  - [x] Huggingface provider (`src/providers/huggingface.ts`)
  - [x] Cloudflare AI - inherits from OpenAI (no changes needed)
  - [x] Voyage provider - only has embedding API (skipped)

### Remaining Work

- [ ] **Phase 5: Final Testing & Validation**
  - [ ] Manual testing with all providers
  - [ ] Performance benchmarks

---

## Executive Summary

This document outlines a comprehensive plan to replace the existing `TokenUsageTracker` with a full OpenTelemetry SDK implementation. This transformation will provide:

- **Per-call tracing** instead of just cumulative totals
- **Distributed trace context** propagation to downstream services
- **GenAI semantic conventions** compliance for LLM observability
- **Export flexibility** to any OTLP-compatible backend (Jaeger, Honeycomb, Datadog, etc.)
- **Unified instrumentation** across all 50+ providers

The existing `TraceStore` infrastructure will be preserved and enhanced to serve as a local OTLP receiver, maintaining backwards compatibility while enabling new capabilities.

---

## Part 1: Architecture Overview

### Current State

```
┌─────────────────────────────────────────────────────────────────┐
│                        Current Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Provider.callApi()                                             │
│         │                                                        │
│         ├──→ TokenUsageTracker.trackUsage()  ← Cumulative only  │
│         │         │                                              │
│         │         └──→ providerUsage[id] += tokens               │
│         │                                                        │
│         └──→ Returns ProviderResponse.tokenUsage                 │
│                                                                  │
│   External OTLP Traces ──→ OTLPReceiver ──→ TraceStore          │
│                            (port 4318)       (SQLite)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Problems:
- No per-call trace data for internal LLM calls
- No distributed tracing context
- Can't correlate LLM calls across evaluation runs
- External traces tracked, internal calls not
```

### Target State

```
┌─────────────────────────────────────────────────────────────────┐
│                        Target Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   OTEL SDK (NodeTracerProvider)                                  │
│         │                                                        │
│         ├──→ tracer.startActiveSpan('chat openai/gpt-4')        │
│         │         │                                              │
│         │         ├──→ span.setAttributes(GenAI conventions)     │
│         │         ├──→ Provider.callApi() executes               │
│         │         ├──→ span.setAttributes(tokenUsage)            │
│         │         └──→ span.end()                                │
│         │                                                        │
│         └──→ BatchSpanProcessor                                  │
│                   │                                              │
│                   ├──→ OTLPTraceExporter (external backends)     │
│                   └──→ LocalSpanExporter (TraceStore/SQLite)     │
│                                                                  │
│   External OTLP Traces ──→ OTLPReceiver ──→ TraceStore          │
│                            (unchanged)       (enhanced)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Benefits:
- Every LLM call creates a span with full metadata
- Token usage as span attributes (GenAI conventions)
- Trace context propagated via W3C traceparent
- Export to any OTLP backend + local storage
- Backwards compatible with existing TraceStore consumers
```

---

## Part 2: Dependencies

### New Dependencies to Add

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-node": "^0.57.0",
    "@opentelemetry/sdk-trace-node": "^1.30.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57.0",
    "@opentelemetry/resources": "^1.30.0",
    "@opentelemetry/semantic-conventions": "^1.28.0"
  }
}
```

### Package Sizes (Approximate)

| Package                                 | Size       | Notes                            |
| --------------------------------------- | ---------- | -------------------------------- |
| @opentelemetry/api                      | ~50KB      | Core API, minimal                |
| @opentelemetry/sdk-node                 | ~200KB     | Full SDK with auto-configuration |
| @opentelemetry/sdk-trace-node           | ~150KB     | Trace provider                   |
| @opentelemetry/exporter-trace-otlp-http | ~80KB      | HTTP exporter                    |
| @opentelemetry/resources                | ~30KB      | Resource attributes              |
| @opentelemetry/semantic-conventions     | ~100KB     | Standard attribute names         |
| **Total**                               | **~610KB** | Acceptable for CLI tool          |

### Peer Dependencies

The OTEL SDK has peer dependencies that may require attention:

- `@opentelemetry/api` must be a singleton (only one version in node_modules)
- Version alignment is critical for SDK components

---

## Part 3: GenAI Semantic Conventions

### Attribute Mapping

The OpenTelemetry GenAI semantic conventions define standard attribute names for LLM observability. We'll map our existing `TokenUsage` type to these conventions:

| TokenUsage Field                       | OTEL GenAI Attribute                      | Type         |
| -------------------------------------- | ----------------------------------------- | ------------ |
| `prompt`                               | `gen_ai.usage.input_tokens`               | int          |
| `completion`                           | `gen_ai.usage.output_tokens`              | int          |
| `total`                                | `gen_ai.usage.total_tokens`               | int          |
| `cached`                               | `gen_ai.usage.cached_tokens`              | int (custom) |
| `completionDetails.reasoning`          | `gen_ai.usage.reasoning_tokens`           | int (custom) |
| `completionDetails.acceptedPrediction` | `gen_ai.usage.accepted_prediction_tokens` | int (custom) |
| `completionDetails.rejectedPrediction` | `gen_ai.usage.rejected_prediction_tokens` | int (custom) |

### Standard GenAI Span Attributes

```typescript
// Request attributes (set before API call)
'gen_ai.system': 'openai' | 'anthropic' | 'bedrock' | ...
'gen_ai.operation.name': 'chat' | 'completion' | 'embedding'
'gen_ai.request.model': 'gpt-4' | 'claude-3-opus' | ...
'gen_ai.request.max_tokens': number
'gen_ai.request.temperature': number
'gen_ai.request.top_p': number
'gen_ai.request.stop_sequences': string[]

// Response attributes (set after API call)
'gen_ai.response.model': string  // May differ from requested
'gen_ai.response.id': string     // Provider's response ID
'gen_ai.response.finish_reasons': string[]
'gen_ai.usage.input_tokens': number
'gen_ai.usage.output_tokens': number

// Promptfoo-specific attributes (namespaced)
'promptfoo.provider.id': string
'promptfoo.eval.id': string
'promptfoo.test.index': number
'promptfoo.prompt.label': string
```

### Span Naming Convention

Follow the GenAI semantic convention for span names:

```
{gen_ai.operation.name} {gen_ai.request.model}
```

Examples:

- `chat gpt-4`
- `chat claude-3-opus`
- `completion text-davinci-003`
- `embedding text-embedding-ada-002`

---

## Part 4: Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

#### 1.1 Create OTEL SDK Setup Module

**File: `src/tracing/otelSdk.ts`**

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { LocalSpanExporter } from './localSpanExporter';
import { getVersion } from '../util/version';

let sdk: NodeSDK | null = null;

export interface OtelConfig {
  enabled: boolean;
  serviceName?: string;
  endpoint?: string; // External OTLP endpoint
  localExport?: boolean; // Export to local TraceStore
  debug?: boolean;
}

export function initializeOtel(config: OtelConfig): void {
  if (!config.enabled || sdk) return;

  if (config.debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName || 'promptfoo',
    [ATTR_SERVICE_VERSION]: getVersion(),
  });

  const spanProcessors: BatchSpanProcessor[] = [];

  // External OTLP exporter (if endpoint configured)
  if (config.endpoint) {
    const otlpExporter = new OTLPTraceExporter({
      url: config.endpoint,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpExporter));
  }

  // Local exporter (writes to TraceStore/SQLite)
  if (config.localExport !== false) {
    const localExporter = new LocalSpanExporter();
    spanProcessors.push(new BatchSpanProcessor(localExporter));
  }

  sdk = new NodeSDK({
    resource,
    spanProcessors,
  });

  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      .then(() => console.log('OTEL SDK shut down successfully'))
      .catch((error) => console.error('Error shutting down OTEL SDK', error))
      .finally(() => process.exit(0));
  });
}

export function shutdownOtel(): Promise<void> {
  if (!sdk) return Promise.resolve();
  return sdk.shutdown();
}
```

#### 1.2 Create Local Span Exporter

**File: `src/tracing/localSpanExporter.ts`**

```typescript
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { getTraceStore } from './store';
import type { SpanData } from './store';

export class LocalSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const traceStore = getTraceStore();
    if (!traceStore) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    try {
      // Group spans by trace ID
      const spansByTrace = new Map<string, SpanData[]>();

      for (const span of spans) {
        const traceId = span.spanContext().traceId;
        const spanData = this.convertSpan(span);

        if (!spansByTrace.has(traceId)) {
          spansByTrace.set(traceId, []);
        }
        spansByTrace.get(traceId)!.push(spanData);
      }

      // Store each trace's spans
      for (const [traceId, spanDataList] of spansByTrace) {
        traceStore.addSpans(traceId, spanDataList);
      }

      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error as Error,
      });
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  private convertSpan(span: ReadableSpan): SpanData {
    const spanContext = span.spanContext();
    return {
      spanId: spanContext.spanId,
      parentSpanId: span.parentSpanId || undefined,
      name: span.name,
      startTime: span.startTime[0] * 1e9 + span.startTime[1],
      endTime: span.endTime[0] * 1e9 + span.endTime[1],
      attributes: span.attributes as Record<string, any>,
      statusCode: span.status.code,
      statusMessage: span.status.message,
    };
  }
}
```

#### 1.3 Create GenAI Tracer Wrapper

**File: `src/tracing/genaiTracer.ts`**

```typescript
import { trace, context, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { TokenUsage } from '../types/shared';

const TRACER_NAME = 'promptfoo.providers';
const TRACER_VERSION = '1.0.0';

export interface GenAISpanContext {
  system: string; // 'openai', 'anthropic', etc.
  operationName: 'chat' | 'completion' | 'embedding';
  model: string;
  providerId: string;

  // Optional request params
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];

  // Promptfoo context
  evalId?: string;
  testIndex?: number;
  promptLabel?: string;
}

export interface GenAISpanResult {
  tokenUsage?: TokenUsage;
  responseModel?: string;
  responseId?: string;
  finishReasons?: string[];
}

/**
 * Start a GenAI span with proper semantic conventions.
 * Use this wrapper for all LLM provider calls.
 */
export async function withGenAISpan<T>(
  ctx: GenAISpanContext,
  fn: (span: Span) => Promise<T>,
  result?: (value: T) => GenAISpanResult,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME, TRACER_VERSION);
  const spanName = `${ctx.operationName} ${ctx.model}`;

  return tracer.startActiveSpan(
    spanName,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        // GenAI semantic conventions - request
        'gen_ai.system': ctx.system,
        'gen_ai.operation.name': ctx.operationName,
        'gen_ai.request.model': ctx.model,
        ...(ctx.maxTokens && { 'gen_ai.request.max_tokens': ctx.maxTokens }),
        ...(ctx.temperature !== undefined && { 'gen_ai.request.temperature': ctx.temperature }),
        ...(ctx.topP !== undefined && { 'gen_ai.request.top_p': ctx.topP }),
        ...(ctx.stopSequences && { 'gen_ai.request.stop_sequences': ctx.stopSequences }),

        // Promptfoo-specific attributes
        'promptfoo.provider.id': ctx.providerId,
        ...(ctx.evalId && { 'promptfoo.eval.id': ctx.evalId }),
        ...(ctx.testIndex !== undefined && { 'promptfoo.test.index': ctx.testIndex }),
        ...(ctx.promptLabel && { 'promptfoo.prompt.label': ctx.promptLabel }),
      },
    },
    async (span) => {
      try {
        const value = await fn(span);

        // Set response attributes
        if (result) {
          const res = result(value);
          setGenAIResponseAttributes(span, res);
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return value;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Set response attributes on an existing span.
 * Call this after the API response is received.
 */
export function setGenAIResponseAttributes(span: Span, result: GenAISpanResult): void {
  if (result.tokenUsage) {
    const usage = result.tokenUsage;
    if (usage.prompt !== undefined) {
      span.setAttribute('gen_ai.usage.input_tokens', usage.prompt);
    }
    if (usage.completion !== undefined) {
      span.setAttribute('gen_ai.usage.output_tokens', usage.completion);
    }
    if (usage.total !== undefined) {
      span.setAttribute('gen_ai.usage.total_tokens', usage.total);
    }
    if (usage.cached !== undefined) {
      span.setAttribute('gen_ai.usage.cached_tokens', usage.cached);
    }
    if (usage.completionDetails?.reasoning !== undefined) {
      span.setAttribute('gen_ai.usage.reasoning_tokens', usage.completionDetails.reasoning);
    }
    if (usage.completionDetails?.acceptedPrediction !== undefined) {
      span.setAttribute(
        'gen_ai.usage.accepted_prediction_tokens',
        usage.completionDetails.acceptedPrediction,
      );
    }
    if (usage.completionDetails?.rejectedPrediction !== undefined) {
      span.setAttribute(
        'gen_ai.usage.rejected_prediction_tokens',
        usage.completionDetails.rejectedPrediction,
      );
    }
  }

  if (result.responseModel) {
    span.setAttribute('gen_ai.response.model', result.responseModel);
  }
  if (result.responseId) {
    span.setAttribute('gen_ai.response.id', result.responseId);
  }
  if (result.finishReasons) {
    span.setAttribute('gen_ai.response.finish_reasons', result.finishReasons);
  }
}

/**
 * Get the current trace context for propagation.
 * Returns W3C traceparent header value.
 */
export function getTraceparent(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return undefined;

  const ctx = activeSpan.spanContext();
  return `00-${ctx.traceId}-${ctx.spanId}-0${ctx.traceFlags}`;
}
```

#### 1.4 Create Configuration Integration

**File: `src/tracing/config.ts`**

```typescript
import { getEnvBool, getEnvString } from '../util/env';
import type { OtelConfig } from './otelSdk';

export function getOtelConfigFromEnv(): OtelConfig {
  return {
    enabled: getEnvBool('PROMPTFOO_OTEL_ENABLED', false),
    serviceName: getEnvString('PROMPTFOO_OTEL_SERVICE_NAME', 'promptfoo'),
    endpoint:
      getEnvString('OTEL_EXPORTER_OTLP_ENDPOINT') || getEnvString('PROMPTFOO_OTEL_ENDPOINT'),
    localExport: getEnvBool('PROMPTFOO_OTEL_LOCAL_EXPORT', true),
    debug: getEnvBool('PROMPTFOO_OTEL_DEBUG', false),
  };
}

export function getOtelConfigFromYaml(config: any): Partial<OtelConfig> {
  return {
    enabled: config?.tracing?.enabled,
    serviceName: config?.tracing?.serviceName,
    endpoint: config?.tracing?.endpoint,
    localExport: config?.tracing?.localExport,
    debug: config?.tracing?.debug,
  };
}
```

---

### Phase 2: Provider Instrumentation (Week 2-3)

#### 2.1 Instrumentation Strategy

The 50+ providers fall into several categories requiring different instrumentation approaches:

**Category A: Direct Implementation (~15 providers)**
Providers that directly implement `callApi()` and need full instrumentation:

- `openai/chat.ts`, `openai/completion.ts`, `openai/embedding.ts`
- `anthropic/index.ts`
- `bedrock.ts`
- `http.ts`
- `ollama.ts`
- `vertex.ts`
- `watsonx.ts`
- `mistral.ts`
- `cohere.ts`
- `huggingface.ts`
- `replicate.ts`
- `voyage.ts`
- `cloudflare-ai.ts`

**Category B: OpenAI-Compatible Inheritors (~25 providers)**
Providers that extend `OpenAiChatCompletionProvider` get instrumentation automatically:

- `groq/chat.ts`
- `together.ts`
- `openrouter.ts`
- `cerebras.ts`
- `azure.ts`
- `fireworks.ts`
- `deepinfra.ts`
- `friendliai.ts`
- `hyperbolic.ts`
- `novita.ts`
- `xai.ts`
- `sambanova.ts`
- `perplexity.ts`
- `portkey.ts`
- `litellm.ts`
- And others...

**Category C: Wrapper/Script Providers (~10 providers)**
These execute external processes and may not need token tracking:

- `scriptCompletion.ts`
- `python/wrapper.ts`
- `browser.ts`
- `docker.ts`
- `exec.ts`
- `golang.ts`
- `webhook.ts`

**Category D: Image/Non-Token Providers**
These don't use traditional token metrics:

- Image generation providers
- Audio providers

#### 2.2 Base Provider Instrumentation Pattern

**File: `src/providers/openai/chat.ts` (modified)**

```typescript
import { withGenAISpan, type GenAISpanContext } from '../../tracing/genaiTracer';
import type { CallApiContextParams, CallApiOptionsParams } from '../../types';

export class OpenAiChatCompletionProvider implements ApiProvider {
  // ... existing constructor and properties ...

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const spanContext: GenAISpanContext = {
      system: this.getGenAISystem(), // 'openai', or override in subclasses
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      maxTokens: this.config.max_tokens,
      temperature: this.config.temperature,
      topP: this.config.top_p,
      stopSequences: this.config.stop,
      evalId: context?.vars?.__evalId as string,
      testIndex: context?.vars?.__testIndex as number,
      promptLabel: context?.prompt?.label,
    };

    return withGenAISpan(
      spanContext,
      async (span) => {
        // Existing API call logic
        const response = await this.doCallApi(prompt, context, callApiOptions);
        return response;
      },
      (response) => ({
        tokenUsage: response.tokenUsage,
        responseModel: response.metadata?.model,
        responseId: response.metadata?.id,
        finishReasons: response.metadata?.finishReasons,
      }),
    );
  }

  /**
   * Override in subclasses to specify the gen_ai.system attribute.
   */
  protected getGenAISystem(): string {
    return 'openai';
  }

  /**
   * Actual API call implementation (extracted from existing callApi).
   */
  protected async doCallApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // ... existing implementation moved here ...
  }
}
```

#### 2.3 Subclass Pattern (e.g., Groq)

**File: `src/providers/groq/chat.ts` (modified)**

```typescript
export class GroqProvider extends OpenAiChatCompletionProvider {
  // ... existing code ...

  protected override getGenAISystem(): string {
    return 'groq';
  }

  // Instrumentation inherited from parent class!
}
```

#### 2.4 Provider Instrumentation Checklist

| Provider          | File                   | Category | Instrumentation                        |
| ----------------- | ---------------------- | -------- | -------------------------------------- |
| OpenAI Chat       | `openai/chat.ts`       | A        | Full span wrapper                      |
| OpenAI Completion | `openai/completion.ts` | A        | Full span wrapper                      |
| OpenAI Embedding  | `openai/embedding.ts`  | A        | Full span wrapper                      |
| Anthropic         | `anthropic/index.ts`   | A        | Full span wrapper                      |
| Bedrock           | `bedrock.ts`           | A        | Full span wrapper                      |
| HTTP              | `http.ts`              | A        | Full span wrapper                      |
| Ollama            | `ollama.ts`            | A        | Full span wrapper                      |
| Vertex            | `vertex.ts`            | A        | Full span wrapper                      |
| Watsonx           | `watsonx.ts`           | A        | Full span wrapper                      |
| Mistral           | `mistral.ts`           | A        | Full span wrapper                      |
| Cohere            | `cohere.ts`            | A        | Full span wrapper                      |
| Huggingface       | `huggingface.ts`       | A        | Full span wrapper + add token tracking |
| Replicate         | `replicate.ts`         | A        | Full span wrapper                      |
| Voyage            | `voyage.ts`            | A        | Full span wrapper                      |
| Cloudflare AI     | `cloudflare-ai.ts`     | A        | Full span wrapper                      |
| Groq              | `groq/chat.ts`         | B        | Inherited (override system)            |
| Together          | `together.ts`          | B        | Inherited                              |
| OpenRouter        | `openrouter.ts`        | B        | Inherited                              |
| Azure             | `azure.ts`             | B        | Inherited                              |
| Cerebras          | `cerebras.ts`          | B        | Inherited                              |
| XAI               | `xai.ts`               | B        | Inherited                              |
| ...               | ...                    | B        | Inherited                              |
| Script            | `scriptCompletion.ts`  | C        | Span wrapper (no tokens)               |
| Python            | `python/wrapper.ts`    | C        | Span wrapper (no tokens)               |
| Browser           | `browser.ts`           | C        | Span wrapper (no tokens)               |

---

### Phase 3: Migration from TokenUsageTracker (Week 3)

#### 3.1 Deprecation Strategy

The `TokenUsageTracker` will be deprecated but not removed immediately. We'll maintain backwards compatibility:

```typescript
// src/util/tokenUsage.ts (modified)

import { trace } from '@opentelemetry/api';

/**
 * @deprecated Use OTEL tracing instead. This class will be removed in v1.0.
 *
 * The TokenUsageTracker now serves as a compatibility layer that:
 * 1. Continues to accumulate totals for existing consumers
 * 2. Reads from OTEL spans when available
 */
export class TokenUsageTracker {
  private static instance: TokenUsageTracker;
  private providerUsage: Record<string, TokenUsage> = {};

  // ... existing implementation ...

  /**
   * Get usage from OTEL spans for a specific trace.
   * New method for consumers migrating to OTEL.
   */
  getUsageFromTrace(traceId: string): TokenUsage {
    // Implementation reads from TraceStore
  }
}
```

#### 3.2 Migration Wrapper

For the transition period, create a unified interface:

**File: `src/util/tokenUsageCompat.ts`**

```typescript
import { TokenUsageTracker } from './tokenUsage';
import { getTraceStore } from '../tracing/store';
import type { TokenUsage } from '../types/shared';

export interface UsageQuery {
  providerId?: string;
  traceId?: string;
  evalId?: string;
}

/**
 * Unified token usage interface that works with both
 * legacy TokenUsageTracker and new OTEL tracing.
 */
export function getTokenUsage(query: UsageQuery): TokenUsage {
  const tracker = TokenUsageTracker.getInstance();

  // If querying by trace/eval, use OTEL data
  if (query.traceId || query.evalId) {
    const store = getTraceStore();
    if (store) {
      return aggregateUsageFromSpans(store, query);
    }
  }

  // Fall back to legacy tracker for provider-level queries
  if (query.providerId) {
    return tracker.getProviderUsage(query.providerId);
  }

  return tracker.getTotalUsage();
}

function aggregateUsageFromSpans(store: TraceStore, query: UsageQuery): TokenUsage {
  // Implementation aggregates gen_ai.usage.* attributes from spans
}
```

---

### Phase 4: Fix Missing Instrumentation (Week 3)

#### 4.1 testCase/synthesis.ts

**Lines 136, 189 - Add token tracking:**

```typescript
// Before (line 136):
const resp = await providerModel.callApi(personasPrompt);
if (resp.error) {
  throw new Error(`Persona generation failed: ${resp.error}`);
}

// After:
const resp = await providerModel.callApi(personasPrompt);
if (resp.error) {
  throw new Error(`Persona generation failed: ${resp.error}`);
}
// Token tracking now automatic via OTEL instrumentation in provider
```

With OTEL instrumentation in the providers, these call sites automatically get traced. No code changes needed at the call site level.

#### 4.2 assertions/synthesis.ts

**Lines 467, 493 - Same pattern:**

The OTEL instrumentation in `callApi()` handles tracing automatically. However, we should ensure the eval context is propagated:

```typescript
// Ensure context includes eval metadata for correlation
const context: CallApiContextParams = {
  vars: {
    ...existingVars,
    __evalId: evalId,
    __synthesisType: 'question_generation',
  },
};
const resp = await providerModel.callApi(newQuestionsPrompt, context);
```

#### 4.3 huggingface.ts

**Add token usage to response:**

```typescript
// src/providers/huggingface.ts (line 132-134)

// Before:
return {
  output: result,
};

// After:
return {
  output: result,
  tokenUsage: {
    // HuggingFace doesn't provide token counts in basic inference API
    // Mark as unknown/uncounted
    numRequests: 1,
  },
};
```

---

### Phase 5: Testing & Validation (Week 4)

#### 5.1 Unit Tests

**File: `test/tracing/genaiTracer.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withGenAISpan, setGenAIResponseAttributes } from '../../src/tracing/genaiTracer';
import { trace, context } from '@opentelemetry/api';

describe('GenAI Tracer', () => {
  describe('withGenAISpan', () => {
    it('should create span with correct GenAI attributes', async () => {
      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
      };

      vi.spyOn(trace, 'getTracer').mockReturnValue({
        startActiveSpan: vi.fn((name, options, fn) => fn(mockSpan)),
      } as any);

      await withGenAISpan(
        {
          system: 'openai',
          operationName: 'chat',
          model: 'gpt-4',
          providerId: 'test-provider',
        },
        async () => ({ output: 'test' }),
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('gen_ai.system', 'openai');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('gen_ai.operation.name', 'chat');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('gen_ai.request.model', 'gpt-4');
    });

    it('should record token usage from response', async () => {
      // ... test implementation
    });

    it('should handle errors and set error status', async () => {
      // ... test implementation
    });
  });
});
```

**File: `test/tracing/localSpanExporter.test.ts`**

```typescript
describe('LocalSpanExporter', () => {
  it('should convert OTEL spans to TraceStore format', () => {
    // ... test implementation
  });

  it('should group spans by trace ID', () => {
    // ... test implementation
  });

  it('should handle export failures gracefully', () => {
    // ... test implementation
  });
});
```

#### 5.2 Integration Tests

**File: `test/integration/otel-tracing.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeOtel, shutdownOtel } from '../../src/tracing/otelSdk';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { getTraceStore } from '../../src/tracing/store';

describe('OTEL Tracing Integration', () => {
  beforeAll(() => {
    initializeOtel({
      enabled: true,
      localExport: true,
    });
  });

  afterAll(async () => {
    await shutdownOtel();
  });

  it('should trace provider calls end-to-end', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4', {
      config: { apiKey: 'test-key' },
    });

    // Mock API response
    vi.spyOn(provider as any, 'doCallApi').mockResolvedValue({
      output: 'Hello!',
      tokenUsage: { prompt: 10, completion: 5, total: 15 },
    });

    await provider.callApi('Hello');

    // Wait for batch processor to flush
    await new Promise((resolve) => setTimeout(resolve, 100));

    const store = getTraceStore();
    const traces = await store.getAllTraces();

    expect(traces.length).toBeGreaterThan(0);
    const span = traces[0].spans[0];
    expect(span.attributes['gen_ai.system']).toBe('openai');
    expect(span.attributes['gen_ai.usage.input_tokens']).toBe(10);
  });
});
```

#### 5.3 Manual Testing Checklist

- [ ] Verify spans appear in local TraceStore
- [ ] Verify spans export to external OTLP endpoint (Jaeger)
- [ ] Verify token usage aggregation matches legacy tracker
- [ ] Verify trace context propagation via traceparent header
- [ ] Verify error spans are created on provider failures
- [ ] Test with streaming responses
- [ ] Test with tool/function calls
- [ ] Test concurrent provider calls
- [ ] Test with all Category A providers
- [ ] Verify inherited instrumentation works for Category B providers

---

### Phase 6: Documentation & Rollout (Week 4)

#### 6.1 Environment Variables

Add to documentation:

| Variable                      | Default     | Description                     |
| ----------------------------- | ----------- | ------------------------------- |
| `PROMPTFOO_OTEL_ENABLED`      | `false`     | Enable OTEL tracing             |
| `PROMPTFOO_OTEL_SERVICE_NAME` | `promptfoo` | Service name in traces          |
| `PROMPTFOO_OTEL_ENDPOINT`     | -           | External OTLP endpoint URL      |
| `PROMPTFOO_OTEL_LOCAL_EXPORT` | `true`      | Export to local TraceStore      |
| `PROMPTFOO_OTEL_DEBUG`        | `false`     | Enable OTEL debug logging       |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | -           | Standard OTEL endpoint variable |

#### 6.2 Configuration YAML

```yaml
# promptfooconfig.yaml
tracing:
  enabled: true
  serviceName: my-llm-app
  endpoint: http://localhost:4318/v1/traces
  localExport: true
  debug: false
```

#### 6.3 Documentation Pages

Create/update:

- `site/docs/configuration/tracing.md` - Full tracing configuration guide
- `site/docs/guides/observability.md` - Observability best practices
- Update `site/docs/providers/` pages to mention tracing support

---

## Part 5: File Changes Summary

### New Files

| File                                     | Purpose                                   |
| ---------------------------------------- | ----------------------------------------- |
| `src/tracing/otelSdk.ts`                 | OTEL SDK initialization and configuration |
| `src/tracing/localSpanExporter.ts`       | Export spans to local TraceStore          |
| `src/tracing/genaiTracer.ts`             | GenAI semantic conventions wrapper        |
| `src/tracing/config.ts`                  | Configuration loading from env/yaml       |
| `src/util/tokenUsageCompat.ts`           | Compatibility layer during migration      |
| `test/tracing/genaiTracer.test.ts`       | Unit tests for tracer                     |
| `test/tracing/localSpanExporter.test.ts` | Unit tests for exporter                   |
| `test/integration/otel-tracing.test.ts`  | Integration tests                         |

### Modified Files

| File                                 | Changes                                       |
| ------------------------------------ | --------------------------------------------- |
| `package.json`                       | Add OTEL dependencies                         |
| `src/providers/openai/chat.ts`       | Add span instrumentation, extract doCallApi   |
| `src/providers/openai/completion.ts` | Add span instrumentation                      |
| `src/providers/openai/embedding.ts`  | Add span instrumentation                      |
| `src/providers/anthropic/index.ts`   | Add span instrumentation                      |
| `src/providers/bedrock.ts`           | Add span instrumentation                      |
| `src/providers/http.ts`              | Add span instrumentation                      |
| `src/providers/ollama.ts`            | Add span instrumentation                      |
| `src/providers/vertex.ts`            | Add span instrumentation                      |
| `src/providers/watsonx.ts`           | Add span instrumentation                      |
| `src/providers/mistral.ts`           | Add span instrumentation                      |
| `src/providers/cohere.ts`            | Add span instrumentation                      |
| `src/providers/huggingface.ts`       | Add span instrumentation + token tracking     |
| `src/providers/replicate.ts`         | Add span instrumentation                      |
| `src/providers/voyage.ts`            | Add span instrumentation                      |
| `src/providers/cloudflare-ai.ts`     | Add span instrumentation                      |
| `src/providers/groq/chat.ts`         | Override getGenAISystem()                     |
| `src/util/tokenUsage.ts`             | Add deprecation notice, compatibility methods |
| `src/tracing/store.ts`               | Add span query methods                        |
| `src/index.ts` or `src/main.ts`      | Initialize OTEL SDK on startup                |

---

## Part 6: Risk Assessment & Mitigations

### Risks

| Risk                                       | Likelihood | Impact | Mitigation                                   |
| ------------------------------------------ | ---------- | ------ | -------------------------------------------- |
| Breaking existing token tracking consumers | Medium     | High   | Compatibility layer, phased rollout          |
| Performance overhead from tracing          | Low        | Medium | Batch processor, configurable sampling       |
| OTEL SDK version conflicts                 | Medium     | Medium | Pin versions, test with common versions      |
| Span context lost in async operations      | Medium     | High   | Use context.with() for critical paths        |
| Large trace payloads from LLM prompts      | Medium     | Low    | Don't log prompt/response content by default |
| Provider-specific edge cases               | High       | Low    | Extensive testing per provider category      |

### Rollout Strategy

1. **Alpha (Week 1-2)**: Core infrastructure, disabled by default
2. **Beta (Week 3)**: Enable for specific providers, gather feedback
3. **RC (Week 4)**: Enable for all providers, backwards compat testing
4. **GA (Week 5)**: Enable by default, deprecate TokenUsageTracker

---

## Part 7: Future Enhancements

After the initial implementation, consider:

1. **Prompt/Response Logging**: Optional span events for prompt and response content (with PII concerns)
2. **Cost Tracking**: Add cost calculation as span attributes
3. **Sampling**: Implement head-based sampling for high-volume scenarios
4. **Metrics**: Add OTEL metrics for token usage counters, latency histograms
5. **Auto-instrumentation**: Explore instrumenting HTTP clients for API calls
6. **LangChain/LlamaIndex Integration**: Correlate with framework-level traces

---

## Appendix A: GenAI Semantic Conventions Reference

Full specification: https://opentelemetry.io/docs/specs/semconv/gen-ai/

### Span Attributes (Request)

| Attribute                          | Type     | Description                                  |
| ---------------------------------- | -------- | -------------------------------------------- |
| `gen_ai.system`                    | string   | The GenAI system (openai, anthropic, etc.)   |
| `gen_ai.operation.name`            | string   | Operation type (chat, completion, embedding) |
| `gen_ai.request.model`             | string   | Requested model name                         |
| `gen_ai.request.max_tokens`        | int      | Maximum tokens to generate                   |
| `gen_ai.request.temperature`       | float    | Sampling temperature                         |
| `gen_ai.request.top_p`             | float    | Nucleus sampling probability                 |
| `gen_ai.request.top_k`             | int      | Top-k sampling                               |
| `gen_ai.request.stop_sequences`    | string[] | Stop sequences                               |
| `gen_ai.request.frequency_penalty` | float    | Frequency penalty                            |
| `gen_ai.request.presence_penalty`  | float    | Presence penalty                             |

### Span Attributes (Response)

| Attribute                        | Type     | Description            |
| -------------------------------- | -------- | ---------------------- |
| `gen_ai.response.model`          | string   | Actual model used      |
| `gen_ai.response.id`             | string   | Provider's response ID |
| `gen_ai.response.finish_reasons` | string[] | Finish reasons         |
| `gen_ai.usage.input_tokens`      | int      | Prompt tokens          |
| `gen_ai.usage.output_tokens`     | int      | Completion tokens      |
| `gen_ai.usage.total_tokens`      | int      | Total tokens           |

### Custom Attributes (Promptfoo)

| Attribute                                 | Type   | Description                 |
| ----------------------------------------- | ------ | --------------------------- |
| `gen_ai.usage.cached_tokens`              | int    | Cached prompt tokens        |
| `gen_ai.usage.reasoning_tokens`           | int    | Reasoning/thinking tokens   |
| `gen_ai.usage.accepted_prediction_tokens` | int    | Accepted speculative tokens |
| `gen_ai.usage.rejected_prediction_tokens` | int    | Rejected speculative tokens |
| `promptfoo.provider.id`                   | string | Provider identifier         |
| `promptfoo.eval.id`                       | string | Evaluation run ID           |
| `promptfoo.test.index`                    | int    | Test case index             |
| `promptfoo.prompt.label`                  | string | Prompt label                |

---

## Appendix B: Example Trace Visualization

```
Trace: eval-run-abc123
└── promptfoo.eval (5.2s)
    ├── chat gpt-4 (1.2s)
    │   ├── gen_ai.system: openai
    │   ├── gen_ai.request.model: gpt-4
    │   ├── gen_ai.usage.input_tokens: 150
    │   ├── gen_ai.usage.output_tokens: 50
    │   └── promptfoo.test.index: 0
    ├── chat gpt-4 (0.8s)
    │   ├── gen_ai.system: openai
    │   ├── gen_ai.request.model: gpt-4
    │   ├── gen_ai.usage.input_tokens: 200
    │   ├── gen_ai.usage.output_tokens: 75
    │   └── promptfoo.test.index: 1
    └── chat claude-3-opus (3.1s)
        ├── gen_ai.system: anthropic
        ├── gen_ai.request.model: claude-3-opus
        ├── gen_ai.usage.input_tokens: 500
        ├── gen_ai.usage.output_tokens: 200
        ├── gen_ai.usage.cached_tokens: 100
        └── promptfoo.test.index: 2
```

---

## Appendix C: Quick Start Example

After implementation, users can enable tracing with:

```bash
# Enable tracing with local storage only
PROMPTFOO_OTEL_ENABLED=true promptfoo eval

# Export to external OTLP endpoint (e.g., Jaeger)
PROMPTFOO_OTEL_ENABLED=true \
PROMPTFOO_OTEL_ENDPOINT=http://localhost:4318/v1/traces \
promptfoo eval

# Or via config
echo "tracing:
  enabled: true
  endpoint: http://localhost:4318/v1/traces" >> promptfooconfig.yaml
promptfoo eval
```

View traces in the promptfoo UI or any OTLP-compatible backend.
