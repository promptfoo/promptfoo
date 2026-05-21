---
sidebar_position: 4
sidebar_label: TypeScript Types
title: TypeScript Types - Programmatic API Reference
description: TypeScript type definitions for promptfoo's programmatic API, including provider, evaluation input, and output types.
keywords:
  [
    TypeScript,
    API reference,
    types,
    ProviderResponse,
    EvaluateResult,
    GradingResult,
    programmatic API,
  ]
pagination_prev: configuration/extensions
---

# TypeScript Types

Type definitions for promptfoo's [programmatic API](/docs/usage/node-package). For YAML configuration properties, see the [Configuration Reference](/docs/configuration/reference).

## Provider Types

### ProvidersConfig

```typescript
type ProvidersConfig =
  | string
  | ProviderFunction
  | ApiProvider
  | (string | ProviderFunction | ApiProvider | Record<string, ProviderOptions> | ProviderOptions)[];
```

### ProviderFunction

A function that takes a prompt and returns a Promise resolving to a ProviderResponse. Use this to define custom logic for calling an API.

```typescript
type ProviderFunction = (
  prompt: string,
  context?: CallApiContextParams,
  options?: { includeLogProbs?: boolean; abortSignal?: AbortSignal },
) => Promise<ProviderResponse>;
```

### CallApiContextParams

`CallApiContextParams` is the context passed to provider `callApi` implementations and model-graded assertion providers.

```typescript
interface CallApiContextParams {
  filters?: Record<string, (...args: any[]) => string>;
  getCache?: any;
  logger?: any;
  originalProvider?: ApiProvider;
  prompt: Prompt;
  vars: Record<string, VarValue>;
  debug?: boolean;
  test?: AtomicTestCase;
  bustCache?: boolean;

  // W3C Trace Context headers
  traceparent?: string;
  tracestate?: string;

  // Evaluation metadata
  evaluationId?: string;
  testCaseId?: string;
  testIdx?: number;
  promptIdx?: number;
  repeatIndex?: number;
}
```

### ProviderOptions

Includes the `id` of the provider and an optional `config` object for provider-specific configurations.

For providers with built-in cost estimation, `config` can also include pricing overrides such as `cost`, `inputCost`, and `outputCost`. When supported, `inputCost` and `outputCost` take precedence over the legacy shared `cost` value. OpenAI audio-capable models also support `audioCost`, `audioInputCost`, and `audioOutputCost`.

```typescript
interface ProviderOptions {
  id?: ProviderId;
  label?: string;
  config?: any;

  // List of prompt labels to include (exact, group prefix like "group", or wildcard "group:*")
  prompts?: string[];

  // Transform the output, either with inline Javascript, external py/js script, or a function
  // See /docs/configuration/guide#transforming-outputs
  transform?: string | TransformFunction;

  // Sleep this long before each request
  delay?: number;

  // Provider-specific environment overrides
  env?: EnvOverrides;

  // Multi-input definitions for red team targets
  inputs?: Inputs;
}
```

### ProviderResponse

Represents the response from a provider, including output, errors, token usage, and cache status.

```typescript
interface ProviderResponse {
  cached?: boolean;
  cost?: number; // required for cost assertion (see /docs/configuration/expected-outputs/deterministic#cost)
  error?: string;
  output?: any;
  raw?: any;
  prompt?: string | ChatMessage[]; // actual prompt sent, if different from rendered prompt
  metadata?: {
    redteamFinalPrompt?: string;
    http?: {
      status: number;
      statusText: string;
      headers?: Record<string, string>;
      requestHeaders?: Record<string, string>;
    };
    [key: string]: any;
  };
  tokenUsage?: TokenUsage;
  materializationHandled?: boolean;
  materializedVars?: Record<string, string>;
  inputMaterialization?: Record<string, unknown>;
  providerTransformedOutput?: any;
  logProbs?: number[]; // required for perplexity assertion (see /docs/configuration/expected-outputs/deterministic#perplexity)
  latencyMs?: number;
  isRefusal?: boolean; // the provider has explicitly refused to generate a response (see /docs/configuration/expected-outputs/deterministic#is-refusal)
  finishReason?: string;
  sessionId?: string;
  conversationEnded?: boolean;
  conversationEndReason?: string;
  guardrails?: GuardrailResponse;
  isBase64?: boolean;
  format?: string;
  audio?: {
    id?: string;
    data?: string;
    blobRef?: BlobRef;
    transcript?: string;
    [key: string]: any;
  };
  video?: { id?: string; blobRef?: BlobRef; url?: string; model?: string; [key: string]: any };
  images?: ImageOutput[];
}
```

### ProviderEmbeddingResponse

Represents the response from a provider's embedding API.

```typescript
interface ProviderEmbeddingResponse {
  cached?: boolean;
  cost?: number;
  error?: string;
  embedding?: number[];
  latencyMs?: number;
  tokenUsage?: Partial<TokenUsage>;
  metadata?: {
    transformed?: boolean;
    originalText?: string;
    [key: string]: any;
  };
}
```

### GuardrailResponse {#guardrails}

Represents guardrail results from a provider, indicating if input or output was flagged.

```typescript
interface GuardrailResponse {
  flagged?: boolean;
  flaggedInput?: boolean;
  flaggedOutput?: boolean;
  reason?: string;
}
```

## Evaluation Input Types

### TestSuite

`TestSuite` is the resolved runtime suite passed to extension hooks after providers, prompts, tests, filters, and other config have been loaded.

```typescript
interface TestSuite {
  tags?: Record<string, string>;
  description?: string;
  providers: ApiProvider[];
  prompts: Prompt[];
  providerPromptMap?: Record<string, string[]>;
  tests?: TestCase[];
  scenarios?: Scenario[];
  defaultTest?: `file://${string}` | Omit<TestCase, 'description'>;
  nunjucksFilters?: Record<string, (...args: any[]) => string>;
  env?: EnvOverrides;
  derivedMetrics?: DerivedMetric[];
  extensions?: string[] | null;
  redteam?: RedteamConfig;
  tracing?: TracingConfig;
}
```

### TestSuiteConfiguration

The source type name for this pre-parse configuration shape is `TestSuiteConfig`.

```typescript
interface TestSuiteConfig {
  // Optional tags to describe the test suite
  tags?: Record<string, string>;

  // Optional description of what you're trying to test
  description?: string;

  // One or more LLM APIs to use, for example: openai:gpt-5-mini, openai:gpt-5 localai:chat:vicuna
  providers: ProvidersConfig;

  // One or more prompts
  prompts: string | (string | Prompt)[] | Record<string, string>;

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests?: string | (string | TestCase | TestGeneratorConfig)[] | TestGeneratorConfig;

  // Scenarios, groupings of data and tests to be evaluated
  scenarios?: (string | Scenario)[];

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest?: `file://${string}` | Omit<TestCase, 'description'>;

  // Path to write output. Writes to console/web viewer if not set.
  outputPath?: string | string[];

  // Determines whether or not sharing is enabled.
  sharing?:
    | boolean
    | {
        apiBaseUrl?: string;
        appBaseUrl?: string;
      };

  // Nunjucks filters
  nunjucksFilters?: Record<string, string>;

  // Envar overrides
  env?: EnvOverrides | Record<string, string | number | boolean>;

  // Metrics to calculate after the eval has completed
  derivedMetrics?: DerivedMetric[];

  // Extension hooks
  extensions?: string[] | null;

  // Arbitrary metadata about this configuration
  metadata?: Record<string, any>;

  // Red team configuration
  redteam?: RedteamConfig;

  // Whether to write latest results to promptfoo storage. This enables you to use the web viewer.
  writeLatestResults?: boolean;

  // OpenTelemetry tracing configuration
  tracing?: TracingConfig;
}
```

### UnifiedConfig

Combines test suite configuration, evaluation options, and command line options.

```typescript
interface UnifiedConfig extends Omit<TestSuiteConfig, 'providers'> {
  // Exactly one of providers or targets must be set.
  providers?: ProvidersConfig;
  targets?: ProvidersConfig;
  evaluateOptions?: EvaluateOptions;
  commandLineOptions?: Partial<CommandLineOptions>;
}
```

### Scenario

Represents a group of test cases to be evaluated. See also the [scenarios configuration table](/docs/configuration/scenarios#configuration).

```typescript
interface Scenario {
  description?: string;
  config: Partial<TestCase>[];
  tests: TestCase[];
}
```

### DerivedMetric

`DerivedMetric` calculates a metric from named assertion scores after the eval has completed.

```typescript
interface DerivedMetric {
  name: string;
  value: string | ((namedScores: Record<string, number>, context: RunEvalOptions) => number);
}
```

### RunEvalOptions

`RunEvalOptions` is the per-row execution context passed into derived metric callbacks.

```typescript
interface RunEvalOptions {
  provider: ApiProvider;
  prompt: Prompt;
  delay: number;
  test: AtomicTestCase;
  testSuite?: TestSuite;
  nunjucksFilters?: Record<string, (...args: any[]) => string>;
  evaluateOptions?: EvaluateOptions;
  testIdx: number;
  promptIdx: number;
  repeatIndex: number;
  conversations?: Record<
    string,
    { prompt: string | object; input: string; output: string | object; metadata?: object }[]
  >;
  registers?: Record<string, VarValue>;
  isRedteam: boolean;
  concurrency?: number;
  evalId?: string;
  abortSignal?: AbortSignal;
}
```

### Prompt

When specifying a prompt object in a static config:

```typescript
type PromptConfigObject =
  | {
      id: string; // Path, usually prefixed with file://
      label?: string; // How to display it in outputs and web UI
      raw?: string; // Optional inline prompt text
    }
  | {
      raw: string; // Inline prompt text
      label: string; // How to display it in outputs and web UI
      id?: string;
      template?: string;
      display?: string; // Deprecated: use label
      function?: PromptFunction;
      config?: any; // Provider config merged for this prompt
    };
```

When passing a `Prompt` object directly to the Javascript library:

```typescript
interface Prompt {
  // The actual prompt
  raw: string;
  // How it should appear in the UI
  label: string;
  // A function to generate a prompt on a per-input basis. Overrides the raw prompt.
  function?: (context: {
    vars: Record<string, VarValue>;
    provider?: ApiProvider;
  }) => Promise<PromptContent | PromptFunctionResult>;
}
```

### TokenUsage

```typescript
interface TokenUsage {
  prompt?: number;
  completion?: number;
  cached?: number;
  total?: number;
  numRequests?: number;
  completionDetails?: CompletionTokenDetails;
  assertions?: TokenUsage;
}

interface CompletionTokenDetails {
  reasoning?: number;
  acceptedPrediction?: number;
  rejectedPrediction?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}
```

### PromptMetrics

`PromptMetrics` is passed to `EvaluateOptions.progressCallback` and stored on completed prompts.

```typescript
interface PromptMetrics {
  score: number;
  testPassCount: number;
  testFailCount: number;
  testErrorCount: number;
  assertPassCount: number;
  assertFailCount: number;
  totalLatencyMs: number;
  tokenUsage: TokenUsage;
  namedScores: Record<string, number>;
  namedScoresCount: Record<string, number>;
  namedScoreWeights?: Record<string, number>;
  redteam?: {
    pluginPassCount: Record<string, number>;
    pluginFailCount: Record<string, number>;
    strategyPassCount: Record<string, number>;
    strategyFailCount: Record<string, number>;
  };
  cost: number;
}
```

### EvaluateOptions

Options for how the evaluation should be performed.

```typescript
interface EvaluateOptions {
  cache?: boolean;
  delay?: number;
  generateSuggestions?: boolean;
  suggestionsCount?: number;
  /** Deprecated: use maxConcurrency: 1 or -j 1 instead. */
  interactiveProviders?: boolean;
  maxConcurrency?: number;
  repeat?: number;
  showProgressBar?: boolean;
  timeoutMs?: number;
  maxEvalTimeMs?: number;
  isRedteam?: boolean;
  silent?: boolean;
  abortSignal?: AbortSignal;
  progressCallback?: (
    completed: number,
    total: number,
    index: number,
    evalStep: RunEvalOptions,
    metrics: PromptMetrics,
  ) => void;
}
```

## Evaluation Output Types

### EvaluateTable

Results in tabular format.

```typescript
interface EvaluateTable {
  head: {
    prompts: CompletedPrompt[];
    vars: string[];
  };
  body: EvaluateTableRow[];
}

interface EvaluateTableRow {
  description?: string;
  outputs: EvaluateTableOutput[];
  vars: string[];
  test: AtomicTestCase;
  testIdx: number;
}
```

### EvaluateTableOutput

A single evaluation output in tabular format.

```typescript
// 0 = none, 1 = assertion failure, 2 = error
type ResultFailureReason = 0 | 1 | 2;

interface EvaluateTableOutput {
  cost: number;
  failureReason: ResultFailureReason;
  gradingResult?: GradingResult | null;
  id: string;
  latencyMs: number;
  metadata?: Record<string, any>;
  namedScores: Record<string, number>;
  pass: boolean;
  prompt: string;
  provider?: string;
  response?: ProviderResponse;
  score: number;
  testCase: AtomicTestCase;
  text: string;
  tokenUsage?: Partial<TokenUsage>;
  error?: string | null;
  audio?: ProviderResponse['audio'];
  video?: ProviderResponse['video'];
  images?: ImageOutput[];
}
```

### EvaluateSummary

Summary of evaluation results. The latest version is 3, which replaced the table with a prompts property.

```typescript
interface EvaluateSummaryV3 {
  version: 3;
  timestamp: string; // ISO 8601 datetime
  results: EvaluateResult[];
  prompts: CompletedPrompt[];
  stats: EvaluateStats;
}
```

```typescript
interface EvaluateSummaryV2 {
  version: number;
  timestamp: string; // ISO 8601 datetime
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
}
```

### EvaluateStats

Statistics about the evaluation.

```typescript
interface EvaluateStats {
  successes: number;
  failures: number;
  errors: number;
  tokenUsage: Required<TokenUsage>;
  durationMs?: number;
  generationDurationMs?: number;
  evaluationDurationMs?: number;
}
```

### EvaluateResult

Corresponds to a single "cell" in the grid comparison view.

```typescript
interface EvaluateResult {
  id?: string;
  description?: string;
  promptIdx: number;
  testIdx: number;
  testCase: AtomicTestCase;
  promptId: string;
  provider: Pick<ProviderOptions, 'id' | 'label'>;
  prompt: Prompt;
  vars: Record<string, VarValue>;
  response?: ProviderResponse;
  error?: string | null;
  failureReason: ResultFailureReason;
  success: boolean;
  score: number;
  latencyMs: number;
  gradingResult?: GradingResult | null;
  namedScores: Record<string, number>;
  cost?: number;
  metadata?: Record<string, any>;
  tokenUsage?: Required<TokenUsage>;
}
```

### GradingResult

Result of grading a test case.

```typescript
interface ResultSuggestion {
  type: string;
  action: 'replace-prompt' | 'pre-filter' | 'post-filter' | 'note';
  value: string;
}

interface GradingResult {
  pass: boolean; // did test pass?
  score: number; // score between 0 and 1
  reason: string; // plaintext reason for outcome
  namedScores?: Record<string, number>; // labeled metrics attached to this result
  namedScoreWeights?: Record<string, number>; // weighted denominator for namedScores
  tokensUsed?: TokenUsage; // tokens consumed by the test
  componentResults?: GradingResult[]; // nested component results
  assertion?: Assertion; // source assertion
  comment?: string; // user comment
  suggestions?: ResultSuggestion[]; // suggested follow-up actions
  metadata?: {
    pluginId?: string;
    strategyId?: string;
    context?: string | string[];
    contextUnits?: string[];
    renderedAssertionValue?: string;
    renderedGradingPrompt?: string;
    graderError?: true;
    [key: string]: any;
  };
}
```

### CompletedPrompt

A prompt that has been evaluated, including metrics.

```typescript
interface CompletedPrompt {
  id?: string;
  raw: string;
  template?: string;
  display?: string;
  label: string;
  function?: PromptFunction;

  // These config options are merged into the provider config.
  config?: any;
  provider: string;
  metrics?: {
    score: number;
    testPassCount: number;
    testFailCount: number;
    testErrorCount: number;
    assertPassCount: number;
    assertFailCount: number;
    totalLatencyMs: number;
    tokenUsage: TokenUsage;
    namedScores: Record<string, number>;
    namedScoresCount: Record<string, number>;
    namedScoreWeights?: Record<string, number>;
    redteam?: {
      pluginPassCount: Record<string, number>;
      pluginFailCount: Record<string, number>;
      strategyPassCount: Record<string, number>;
      strategyFailCount: Record<string, number>;
    };
    cost: number;
  };
}
```
