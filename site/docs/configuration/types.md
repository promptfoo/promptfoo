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
---

# TypeScript Types

Type definitions for promptfoo's [programmatic API](/docs/usage/node-package). For YAML configuration properties, see the [Configuration Reference](/docs/configuration/reference).

## Provider Types

### ProviderFunction

A function that takes a prompt and returns a Promise resolving to a ProviderResponse. Use this to define custom logic for calling an API.

```typescript
type ProviderFunction = (
  prompt: string,
  context: { vars: Record<string, string | object> },
) => Promise<ProviderResponse>;
```

### ProviderOptions

Includes the `id` of the provider and an optional `config` object for provider-specific configurations.

```typescript
interface ProviderOptions {
  id?: ProviderId;
  config?: any;

  // A label is required when running a red team
  // It can be used to uniquely identify targets even if the provider id changes.
  label?: string;

  // List of prompt labels to include (exact, group prefix like "group", or wildcard "group:*")
  prompts?: string[];

  // Transform the output, either with inline Javascript or external py/js script
  // See /docs/configuration/guide#transforming-outputs
  transform?: string;

  // Sleep this long before each request
  delay?: number;
}
```

### ProviderResponse

Represents the response from a provider, including output, errors, token usage, and cache status.

```typescript
interface ProviderResponse {
  error?: string;
  output?: string | object;
  metadata?: object;
  tokenUsage?: Partial<{
    total: number;
    prompt: number;
    completion: number;
    cached?: number;
  }>;
  cached?: boolean;
  cost?: number; // required for cost assertion (see /docs/configuration/expected-outputs/deterministic#cost)
  logProbs?: number[]; // required for perplexity assertion (see /docs/configuration/expected-outputs/deterministic#perplexity)
  isRefusal?: boolean; // the provider has explicitly refused to generate a response (see /docs/configuration/expected-outputs/deterministic#is-refusal)
  guardrails?: GuardrailResponse;
}
```

### ProviderEmbeddingResponse

Represents the response from a provider's embedding API.

```typescript
interface ProviderEmbeddingResponse {
  error?: string;
  embedding?: number[];
  tokenUsage?: Partial<TokenUsage>;
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

### TestSuiteConfiguration

```typescript
interface TestSuiteConfig {
  // Optional description of what you're trying to test
  description?: string;

  // One or more LLM APIs to use, for example: openai:gpt-5-mini, openai:gpt-5 localai:chat:vicuna
  providers: ProviderId | ProviderFunction | (ProviderId | ProviderOptionsMap | ProviderOptions)[];

  // One or more prompts
  prompts: (FilePath | Prompt | PromptFunction)[];

  // Path to a test file, OR list of LLM prompt variations (aka "test case")
  tests: FilePath | (FilePath | TestCase)[];

  // Scenarios, groupings of data and tests to be evaluated
  scenarios?: Scenario[];

  // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
  defaultTest?: Omit<TestCase, 'description'>;

  // Path to write output. Writes to console/web viewer if not set.
  outputPath?: FilePath | FilePath[];

  // Determines whether or not sharing is enabled.
  sharing?:
    | boolean
    | {
        apiBaseUrl?: string;
        appBaseUrl?: string;
      };

  // Nunjucks filters
  nunjucksFilters?: Record<string, FilePath>;

  // Envar overrides
  env?: EnvOverrides;

  // Whether to write latest results to promptfoo storage. This enables you to use the web viewer.
  writeLatestResults?: boolean;
}
```

### UnifiedConfig

Combines test suite configuration, evaluation options, and command line options.

```typescript
interface UnifiedConfig extends TestSuiteConfiguration {
  evaluateOptions: EvaluateOptions;
  commandLineOptions: Partial<CommandLineOptions>;
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

### Prompt

When specifying a prompt object in a static config:

```typescript
interface Prompt {
  id: string; // Path, usually prefixed with file://
  label: string; // How to display it in outputs and web UI
}
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
    vars: Record<string, string | object>;
    config?: Record<string, any>;
    provider?: ApiProvider;
  }) => Promise<string | object>;
}
```

### EvaluateOptions

Options for how the evaluation should be performed.

```typescript
interface EvaluateOptions {
  maxConcurrency?: number;
  showProgressBar?: boolean;
  progressCallback?: (progress: number, total: number) => void;
  generateSuggestions?: boolean;
  repeat?: number;
  delay?: number;
}
```

## Evaluation Output Types

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
  version: 2;
  timestamp: string; // ISO 8601 datetime
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
}
```

### EvaluateResult

Corresponds to a single "cell" in the grid comparison view.

```typescript
interface EvaluateResult {
  provider: Pick<ProviderOptions, 'id'>;
  prompt: Prompt;
  vars: Record<string, string | object>;
  response?: ProviderResponse;
  error?: string;
  success: boolean;
  score: number;
  latencyMs: number;
  gradingResult?: GradingResult;
  metadata?: Record<string, any>;
}
```

### GradingResult

Result of grading a test case.

```typescript
interface GradingResult {
  pass: boolean;                        # did test pass?
  score: number;                        # score between 0 and 1
  reason: string;                       # plaintext reason for outcome
  tokensUsed?: TokenUsage;              # tokens consumed by the test
  componentResults?: GradingResult[];   # if this is a composite score, it can have nested results
  assertion: Assertion | null;          # source of assertion
  latencyMs?: number;                   # latency of LLM call
}
```

### EvaluateStats

Statistics about the evaluation.

```typescript
interface EvaluateStats {
  successes: number;
  failures: number;
  tokenUsage: Required<TokenUsage>;
}
```

### EvaluateTable

Results in tabular format.

```typescript
interface EvaluateTable {
  head: {
    prompts: Prompt[];
    vars: string[];
  };
  body: {
    outputs: EvaluateTableOutput[];
    vars: string[];
  }[];
}
```

### EvaluateTableOutput

A single evaluation output in tabular format.

```typescript
interface EvaluateTableOutput {
  pass: boolean;
  score: number;
  text: string;
  prompt: string;
  latencyMs: number;
  tokenUsage?: Partial<TokenUsage>;
  gradingResult?: GradingResult;
}
```

### CompletedPrompt

A prompt that has been evaluated, including metrics.

```typescript
interface CompletedPrompt {
  id?: string;
  raw: string;
  label: string;
  function?: PromptFunction;

  // These config options are merged into the provider config.
  config?: any;
  provider: string;
  metrics?: {
    score: number;
    testPassCount: number;
    testFailCount: number;
    assertPassCount: number;
    assertFailCount: number;
    totalLatencyMs: number;
    tokenUsage: TokenUsage;
    namedScores: Record<string, number>;
    namedScoresCount: Record<string, number>;
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
