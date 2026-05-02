---
sidebar_label: Node API Reference
sidebar_position: 21
title: Node API reference
description: Reference guide for promptfoo's Node.js APIs, including evals, providers, assertions, caching, guardrails, red teaming, and utilities.
---

# Node Module API Reference

This guide documents the **Node.js module API** for advanced programmatic usage of promptfoo. It covers all publicly exported functions, namespaces, and types.

:::info
For standard YAML-based evaluation configuration, see [Configuration Guide](/docs/configuration/guide). This API reference is for users building programmatic evaluation workflows directly in JavaScript/TypeScript.
:::

## Overview

The promptfoo Node module provides programmatic access to:

- **Core evaluation engine** (`evaluate()`)
- **Provider management** (load and resolve LLM providers)
- **Assertion execution** (run assertions independently)
- **Cache management** (control caching behavior)
- **Security guardrails** (PII, harm, moderation checks)
- **Adversarial testing** (red team evaluation)

## Core API

### `evaluate(testSuite, options?)`

The main entry point for running evaluations programmatically.

```typescript
async function evaluate(testSuite: EvaluateTestSuite, options?: EvaluateOptions): Promise<Eval>;
```

**Parameters:**

- `testSuite`: Configuration object containing `prompts`, `providers`, and `tests`
- `options`: Optional evaluation settings (caching, output, concurrency, etc.)

**Returns:** `Eval` record. Call `toEvaluateSummary()` when you need the serializable results summary.

**Example:**

```typescript
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate({
  prompts: ['What is 2+2?'],
  providers: ['openai:chat:gpt-5.5', 'anthropic:messages:claude-opus-4-7'],
  tests: [
    {
      vars: { query: 'math question' },
      assert: [
        {
          type: 'contains',
          value: '4',
          metric: 'is_correct',
        },
      ],
    },
  ],
});
const results = await evalRecord.toEvaluateSummary();

console.log(`Passed: ${results.stats.successes}/${results.results.length}`);
console.log(`Shareable URL: ${evalRecord.shareableUrl}`);
```

**Common Options:**

```typescript
interface EvaluateOptions {
  // Output and format
  outputPath?: string | string[];
  formatOutput?: boolean;

  // Evaluation behavior
  maxConcurrency?: number;
  nunjucksFilters?: Record<string, Function>;

  // Caching
  cache?: boolean;

  // Sharing and persistence
  sharing?: boolean;
  writeLatestResults?: boolean;

  // Progress tracking
  onTestComplete?: (result: EvaluateResult) => void;
}
```

---

## Provider APIs

### `loadApiProvider(providerPath, context?)`

Load a single provider instance by path or identifier.

```typescript
async function loadApiProvider(
  providerPath: string,
  context?: LoadApiProviderContext,
): Promise<ApiProvider>;
```

**Parameters:**

- `providerPath`: Provider identifier (e.g., `'openai:chat:gpt-5.5'`, `'anthropic:messages:claude-opus-4-7'`, or `'file://./custom-provider.js'`)
- `context`: Optional context with environment overrides

**Returns:** Configured `ApiProvider` instance ready to call

**Example:**

```typescript
import { loadApiProvider } from 'promptfoo';

const openaiProvider = await loadApiProvider('openai:chat:gpt-5.5', {
  env: { OPENAI_API_KEY: process.env.MY_SECRET_KEY },
});

const response = await openaiProvider.callApi('Hello, world!');

console.log(response.output);
```

**Supported Provider Types:**

- `openai:*` (GPT models)
- `anthropic:*` (Claude models)
- `azure:*`
- `bedrock:*` (AWS Bedrock)
- `vertex:*` (Google Vertex AI)
- `cohere:*`
- `replicate:*`
- `huggingface:*`
- Custom files: `file://./path/to/provider.js`
- Custom functions via inline JavaScript

---

To load several providers for manual testing, call `loadApiProvider()` for each one:

```typescript
import { loadApiProvider } from 'promptfoo';

const providers = await Promise.all(
  ['openai:chat:gpt-5.5', 'anthropic:messages:claude-opus-4-7'].map((providerPath) =>
    loadApiProvider(providerPath),
  ),
);

for (const provider of providers) {
  const result = await provider.callApi('Test');
  console.log(`${provider.id()}: ${result.output}`);
}
```

---

## Assertions API

### `assertions.runAssertion(params)`

Execute a single assertion against provider output. **Powerful for custom evaluation logic.**

```typescript
async function runAssertion({
  prompt?: string;
  provider?: ApiProvider;
  assertion: Assertion;
  test: AtomicTestCase;
  vars?: Record<string, VarValue>;
  latencyMs?: number;
  providerResponse: ProviderResponse;
  traceId?: string;
  traceData?: TraceData | null;
}): Promise<GradingResult>
```

**Parameters:**

- `assertion`: The assertion to run (e.g., `{ type: 'contains', value: 'expected' }`)
- `test`: The test case context
- `providerResponse`: The output from the provider to evaluate
- `vars`: Template variables from the test
- `provider`: Provider instance (optional, for context)
- `traceData`: Distributed trace data for debugging (optional)

**Returns:**

```typescript
interface GradingResult {
  pass: boolean; // Did the assertion pass?
  score?: number; // 0-1 score
  reason?: string; // Explanation
  assertion: Assertion; // The original assertion
  metric?: string; // Metric name
  error?: string; // Error message if failed
}
```

**Example: Custom Assertion Logic**

```typescript
import { assertions } from 'promptfoo';

const result = await assertions.runAssertion({
  assertion: {
    type: 'javascript',
    value: (output, context) => {
      // Custom grading logic
      const score = output.includes('yes') ? 1.0 : 0.0;
      return {
        pass: score >= 0.8,
        score,
        reason: `Output contains required keyword`,
      };
    },
  },
  test: {
    vars: { question: 'Is the sky blue?' },
    assert: [], // populated with assertion
  },
  providerResponse: {
    output: 'Yes, the sky is blue in most places.',
    tokenUsage: { total: 15 },
  },
});

console.log(`Pass: ${result.pass}, Score: ${result.score}`);
```

**Assertion Value Function Context:**

```typescript
interface AssertionValueFunctionContext {
  // Test and evaluation metadata
  prompt: string | undefined;
  vars: Record<string, unknown>; // Template variables
  test: AtomicTestCase; // Full test context

  // Provider info
  provider: ApiProvider | undefined;
  providerResponse: ProviderResponse | undefined;

  // Output metadata
  logProbs?: number[]; // Token log probabilities

  // Advanced: Tracing
  trace?: TraceData; // Distributed trace with spans
  config?: Record<string, any>; // Custom assertion config
}
```

**Using Trace Data:**

```typescript
import { assertions } from 'promptfoo';

const result = await assertions.runAssertion({
  assertion: {
    type: 'javascript',
    value: (output, context) => {
      // Access trace data for latency analysis
      if (context.trace?.spans) {
        const ttft = context.trace.spans.find((s) => s.name === 'time_to_first_token');
        console.log(`Time to first token: ${ttft?.duration}ms`);
      }
      return { pass: true };
    },
  },
  test: { vars: {} },
  providerResponse: { output: 'test' },
  traceId: 'trace-123',
  traceData: {
    spans: [
      {
        name: 'time_to_first_token',
        startTime: Date.now(),
        duration: 250,
      },
    ],
  },
});
```

---

### `assertions.runAssertions(params)`

Execute multiple assertions in batch against provider output.

```typescript
async function runAssertions({
  assertions: (Assertion | AssertionSet)[];
  prompt?: string;
  test: AtomicTestCase;
  provider?: ApiProvider;
  vars?: Record<string, VarValue>;
  providerResponse: ProviderResponse;
  latencyMs?: number;
  traceData?: TraceData | null;
}): Promise<AssertionsResult>
```

**Returns:**

```typescript
interface GradingResult {
  pass: boolean;
  score: number; // Aggregate score across all assertions
  reason?: string;
  componentResults?: GradingResult[]; // Per-assertion results
  namedScores?: Record<string, number>;
  tokensUsed?: {
    total: number;
    prompt: number;
    completion: number;
    cached: number;
    numRequests: number;
  };
}
```

**Example:**

```typescript
import { assertions } from 'promptfoo';

const result = await assertions.runAssertions({
  assertions: [
    { type: 'contains', value: '4' },
    { type: 'regex', value: '^The answer is \\d+$' },
    { type: 'not-regex', value: '(?i)error|failed' },
  ],
  test: { vars: { question: 'What is 2+2?' } },
  providerResponse: { output: 'The answer is 4.' },
});

console.log(`All passed: ${result.pass}`);
console.log(`Average score: ${result.score}`);
result.componentResults?.forEach((r) => console.log(`  ${r.assertion?.type}: ${r.pass}`));
```

---

## Cache API

Control promptfoo's caching layer for LLM provider calls.

### `enableCache()`

Enable caching for provider calls (default).

```typescript
export function enableCache(): void;
```

**Example:**

```typescript
import { cache, evaluate } from 'promptfoo';

cache.enableCache();
```

---

### `disableCache()`

Disable caching. Useful during development/testing to always hit the provider.

```typescript
export function disableCache(): void;
```

**Example:**

```typescript
import { cache, evaluate } from 'promptfoo';

// Disable for fresh results
cache.disableCache();
const evalRecord = await evaluate(testSuite);
cache.enableCache();
```

---

### `isCacheEnabled()`

Check if caching is currently enabled.

```typescript
export function isCacheEnabled(): boolean;
```

---

### `clearCache()`

Clear all cached results.

```typescript
export async function clearCache(): Promise<void>;
```

**Example:**

```typescript
import { cache, evaluate } from 'promptfoo';

// Clear old cache
await cache.clearCache();
await evaluate(testSuite); // Will refetch all provider calls
```

---

### `withCacheNamespace(namespace, fn)`

Run evaluation with isolated cache namespace.

```typescript
export function withCacheNamespace<T>(
  namespace: string | undefined,
  fn: () => Promise<T>,
): Promise<T>;
```

**Use Cases:**

- Isolate caches for different test runs
- Prevent cache collisions across environments
- Version-specific caching

**Example:**

```typescript
import { cache, evaluate } from 'promptfoo';

// Run v1 and v2 evals with separate caches
const v1Results = await cache.withCacheNamespace('v1', async () => {
  return evaluate(testSuiteV1);
});

const v2Results = await cache.withCacheNamespace('v2', async () => {
  return evaluate(testSuiteV2);
});
```

---

### `getCache()`

Get the underlying cache instance for advanced operations.

```typescript
export function getCache(): Cache;

interface Cache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

---

### `fetchWithCache(url, options?, timeout?, format?, bust?, maxRetries?)`

Fetch with caching enabled.

```typescript
export async function fetchWithCache<T>(
  url: string,
  options?: RequestInit,
  timeout?: number,
  format?: 'json' | 'text',
  bust?: boolean,
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>>;
```

**Example:**

```typescript
import { cache } from 'promptfoo';

const result = await cache.fetchWithCache(
  'https://api.example.com/data',
  { method: 'GET' },
  undefined,
  'json',
);

console.log(result.cached); // true if from cache
console.log(result.data); // the fetched data
```

**Configuration:**
Set cache location and TTL via environment variables:

```bash
# Cache directory (default: ~/.promptfoo/cache)
export PROMPTFOO_CACHE_PATH=/path/to/cache

# Cache TTL in seconds (default: 604800 = 7 days)
export PROMPTFOO_CACHE_TTL=604800

# Disable cache via env
export PROMPTFOO_CACHE_ENABLED=false
```

---

## Guardrails API

Content safety and security layer. Use guardrails to detect PII, harmful content, and other safety concerns.

### `guardrails.guard(input)`

Run general content moderation.

```typescript
async function guard(input: string): Promise<GuardResult>;
```

**Returns:**

```typescript
interface GuardResult {
  model: string;
  results: Array<{
    categories: Record<string, boolean>; // e.g., { hate: false, violence: true }
    category_scores: Record<string, number>; // Scores 0-1
    flagged: boolean; // Any category flagged?
  }>;
}
```

**Example:**

```typescript
import { guardrails } from 'promptfoo';

const result = await guardrails.guard('This is a test message');

if (result.results[0].flagged) {
  console.log('Content flagged for safety issues:');
  Object.entries(result.results[0].categories).forEach(([name, flagged]) => {
    if (flagged) {
      console.log(`  ${name}: ${result.results[0].category_scores[name]}`);
    }
  });
}
```

---

### `guardrails.pii(input)`

Detect personally identifiable information (PII).

```typescript
async function pii(input: string): Promise<GuardResult>;
```

**Returns:** GuardResult with PII detection details

**Example:**

```typescript
import { guardrails } from 'promptfoo';

const result = await guardrails.pii('John Doe, john@example.com, SSN: 123-45-6789');

if (result.results[0].flagged) {
  console.log('PII detected:');
  if (result.results[0].payload?.pii) {
    result.results[0].payload.pii.forEach((item) => {
      console.log(`  ${item.type}: ${item.value}`);
    });
  }
}
```

---

### `guardrails.harm(input)`

Detect harmful content (violence, hate speech, etc.).

```typescript
async function harm(input: string): Promise<GuardResult>;
```

---

### `guardrails.adaptive(request)`

Run adaptive guardrails with custom configuration.

```typescript
async function adaptive(request: AdaptiveRequest): Promise<AdaptiveResult>;
```

---

## Red Team API

Adversarial testing framework for finding vulnerabilities in LLM systems.

### `redteam.generate(config)`

Generate adversarial test cases.

```typescript
async function generate(config: RedteamGenerateConfig): Promise<RedteamGenerateResult>;
```

See [Red Teaming Guide](/docs/red-team/) for full documentation.

---

### `redteam.run(config)`

Run full red team evaluation against a system.

```typescript
async function run(config: RedteamRunConfig): Promise<RedteamRunResult>;
```

---

### `redteam.Plugins`

Registry of available red team attack plugins.

```typescript
interface Plugins {
  [pluginName: string]: typeof RedteamPluginBase;
}

// Example plugins
Plugins['prompt-injection']; // Injection attacks
Plugins['jailbreak']; // Jailbreak attempts
Plugins['rbac']; // RBAC bypasses
Plugins['sql-injection']; // SQL injection
// ... and many more
```

**Creating Custom Plugins:**

```typescript
import { redteam } from 'promptfoo';

class MyCustomPlugin extends redteam.Base.Plugin {
  async run(params: RedteamPluginRunParams): Promise<RedteamPluginResult> {
    // Custom attack logic
    return {
      generated: ['attack1', 'attack2'],
      stats: { duration: 100 },
    };
  }
}

// Register and use
export default MyCustomPlugin;
```

---

### `redteam.Strategies`

Registry of red team strategies for composing attacks.

```typescript
interface Strategies {
  [strategyName: string]: RedteamStrategy;
}
```

See [Red Teaming Strategies](/docs/red-team/strategies/) for details.

---

### `redteam.Extractors`

Extract system information for targeted attacks.

```typescript
const {
  extractEntities, // Extract named entities from system
  extractMcpToolsInfo, // Extract MCP tool metadata
  extractSystemPurpose, // Extract system purpose and goal
} = redteam.Extractors;
```

**Example:**

```typescript
import { redteam } from 'promptfoo';

const purpose = await redteam.Extractors.extractSystemPurpose({
  prompt: 'You are a helpful assistant...',
});

console.log(`System purpose: ${purpose}`);
```

---

### `redteam.Base.Plugin`

Base class for custom red team plugins.

```typescript
abstract class RedteamPluginBase {
  async run(params: {
    target: Prompt;
    injectVar?: string;
    conversationHistory?: Message[];
    options?: Record<string, unknown>;
  }): Promise<RedteamPluginResult>;
}
```

See **Plugin Development Guide** (below) for examples.

---

### `redteam.Base.Grader`

Base class for custom red team graders.

```typescript
abstract class RedteamGraderBase {
  async grade(params: { prompt: string; output: string; rubric: string }): Promise<GradingResult>;
}
```

---

## Utilities

### `generateTable(evaluateTable, tableCellMaxLength?, maxRows?)`

Format evaluation results as a display table.

```typescript
export function generateTable(
  evaluateTable: EvaluateTable,
  tableCellMaxLength?: number,
  maxRows?: number,
): string;
```

**Example:**

```typescript
import { evaluate, generateTable } from 'promptfoo';

const evalRecord = await evaluate(testSuite);
const table = await evalRecord.getTable();
console.log(generateTable(table));
```

---

### `isTransformFunction(value)`

Check if a value is a transform function (for custom prompt/variable transforms).

```typescript
export function isTransformFunction(value: unknown): value is TransformFunction;
```

**Example:**

```typescript
import { isTransformFunction } from 'promptfoo';

const maybeTransform = (x) => x.toUpperCase();
console.log(isTransformFunction(maybeTransform)); // true
```

---

## Advanced Patterns

### Pattern 1: Programmatic Test Suite Generation

Dynamically generate test cases:

```typescript
import { evaluate } from 'promptfoo';

const generateTests = (questions) => {
  return questions.map((q) => ({
    vars: { question: q },
    assert: [
      { type: 'contains', value: 'verified-fact' },
      {
        type: 'custom-llm-rubric',
        value: 'Is the answer accurate?',
      },
    ],
  }));
};

const evalRecord = await evaluate({
  prompts: ['Answer: {{ question }}'],
  providers: ['openai:chat:gpt-5.5'],
  tests: generateTests([
    'What is the capital of France?',
    'What is 2+2?',
    'What is photosynthesis?',
  ]),
});
```

---

### Pattern 2: Custom Grading with Context

Use provider response data in assertions:

```typescript
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate({
  prompts: ['Analyze: {{ text }}'],
  providers: ['openai:chat:gpt-5.5'],
  tests: [
    {
      vars: { text: 'Sample text' },
      assert: [
        {
          type: 'javascript',
          value: (output, context) => {
            // Access token usage from provider response
            const tokens = context.providerResponse?.tokenUsage?.total || 0;
            return {
              pass: tokens < 100,
              reason: `Used ${tokens} tokens`,
            };
          },
        },
      ],
    },
  ],
});
```

---

### Pattern 3: Batch Provider Testing

Load providers and test in parallel:

```typescript
import { assertions, loadApiProvider } from 'promptfoo';

const providers = await Promise.all(
  ['openai:chat:gpt-5.5', 'anthropic:messages:claude-opus-4-7'].map((providerPath) =>
    loadApiProvider(providerPath),
  ),
);

const testCases = ['2+2=?', 'What is AI?'];

for (const provider of providers) {
  console.log(`Testing ${provider.id()}:`);
  for (const test of testCases) {
    const response = await provider.callApi(test);

    const result = await assertions.runAssertion({
      provider,
      assertion: { type: 'contains', value: 'answer' },
      test: { vars: { prompt: test } },
      providerResponse: response,
    });

    console.log(`  ${test}: ${result.pass ? '✓' : '✗'}`);
  }
}
```

---

### Pattern 4: Cache Isolation for A/B Testing

Compare two model versions with isolated caches:

```typescript
import { cache, evaluate } from 'promptfoo';

async function compareModels(oldVersion, newVersion, testSuite) {
  const oldEval = await cache.withCacheNamespace(`model-${oldVersion}`, () =>
    evaluate({
      ...testSuite,
      providers: [`openai:chat:${oldVersion}`],
    }),
  );

  const newEval = await cache.withCacheNamespace(`model-${newVersion}`, () =>
    evaluate({
      ...testSuite,
      providers: [`openai:chat:${newVersion}`],
    }),
  );

  const oldResults = await oldEval.toEvaluateSummary();
  const newResults = await newEval.toEvaluateSummary();

  return {
    oldPass: oldResults.stats.successes,
    newPass: newResults.stats.successes,
    improvement: newResults.stats.successes - oldResults.stats.successes,
  };
}
```

---

## Type Definitions

All types are exported from `promptfoo` and available in TypeScript:

```typescript
import type {
  // Main types
  EvaluateTestSuite,
  EvaluateOptions,
  EvaluateSummary,
  EvaluateResult,

  // Test configuration
  TestCase,
  AtomicTestCase,
  Assertion,
  AssertionSet,

  // Provider types
  ApiProvider,
  ProviderResponse,
  ProviderConfig,

  // Evaluation types
  GradingResult,
  AssertionValueFunctionContext,

  // Transform types
  TransformFunction,
  TransformContext,

  // Extension hooks
  BeforeAllExtensionHookContext,
  AfterEachExtensionHookContext,
  // ... and more
} from 'promptfoo';
```

---

## API Stability

### Stable APIs (Safe for production)

- `evaluate()`
- `loadApiProvider()`
- `assertions.runAssertion()`, `assertions.runAssertions()`
- Cache namespace functions
- Guardrails namespace

### Experimental APIs (May change)

- `redteam.*` (plugin/strategy system)
- Trace data structures

### Internal APIs (Don't use directly)

- Functions not exported from main `promptfoo` module
- Test utilities
- CLI-specific functions

---

## Troubleshooting

**Cache issues?**

```typescript
// Clear cache if stale
import { cache } from 'promptfoo';
await cache.clearCache();

// Or disable for development
cache.disableCache();
```

**Type errors with custom assertions?**

```typescript
import type { AssertionValueFunctionContext } from 'promptfoo';

// Type-safe context usage
value: (output, context: AssertionValueFunctionContext) => {
  // Full autocomplete and type checking
};
```

**Need to debug evaluation flow?**

```typescript
// Enable verbose logging
process.env.LOG_LEVEL = 'debug';

// Or check trace data in assertions
const result = await assertions.runAssertion({
  // ...
  traceData: trace, // Access timing information
});
```

---

## Examples Repository

Find runnable examples in the [promptfoo examples](https://github.com/promptfoo/promptfoo/tree/main/examples) directory.

---

## See Also

- [Configuration Guide](/docs/configuration/guide) - YAML-based setup
- [Red Teaming Guide](/docs/red-team/) - Adversarial testing
- [Assertions Reference](/docs/configuration/expected-outputs/) - Assertion types
- [Providers Reference](/docs/providers/) - LLM provider setup
