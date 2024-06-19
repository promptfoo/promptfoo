---
sidebar_position: 2
---

# Reference

Here is the main structure of the promptfoo configuration file:

### Config

| Property                        | Type                                                                                                                   | Required | Description                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| description                     | string                                                                                                                 | No       | Optional description of what your LLM is trying to do                                                            |
| providers                       | string \| string[] \| [Record\<string, ProviderOptions\>](/docs/providers/openai#using-functions) \| ProviderOptions[] | Yes      | One or more [LLM APIs](/docs/providers) to use                                                                   |
| prompts                         | string \| string[]                                                                                                     | Yes      | One or more prompt files to load                                                                                 |
| tests                           | string \| [Test Case](#test-case)[]                                                                                    | Yes      | Path to a test file, OR list of LLM prompt variations (aka "test case")                                          |
| defaultTest                     | Partial [Test Case](#test-case)                                                                                        | No       | Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example. |
| outputPath                      | string                                                                                                                 | No       | Where to write output. Writes to console/web viewer if not set.                                                  |
| evaluateOptions.maxConcurrency  | number                                                                                                                 | No       | Maximum number of concurrent requests. Defaults to 4                                                             |
| evaluateOptions.repeat          | number                                                                                                                 | No       | Number of times to run each test case . Defaults to 1                                                            |
| evaluateOptions.delay           | number                                                                                                                 | No       | Force the test runner to wait after each API call (milliseconds)                                                 |
| evaluateOptions.showProgressBar | boolean                                                                                                                | No       | Whether to display the progress bar                                                                              |

### Test Case

A test case represents a single example input that is fed into all prompts and providers.

| Property              | Type                                        | Required | Description                                                                                                                                 |
| --------------------- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| description           | string                                      | No       | Description of what you're testing                                                                                                          |
| vars                  | Record\<string, string \| string[] \| any\> | No       | Key-value pairs to substitute in the prompt. If `vars` is a plain string, it will be treated as a YAML filepath to load a var mapping from. |
| assert                | [Assertion](#assertion)[]                   | No       | List of automatic checks to run on the LLM output                                                                                           |
| threshold             | number                                      | No       | Test will fail if the combined score of assertions is less than this number                                                                 |
| options               | Object                                      | No       | Additional configuration settings                                                                                                           |
| options.prefix        | string                                      | No       | This is prepended to the prompt                                                                                                             |
| options.suffix        | string                                      | No       | This is appended to the prompt                                                                                                              |
| options.transform     | string                                      | No       | A filepath (js or py), or JavaScript snippet that runs on LLM output before any assertions                                                  |
| options.storeOutputAs | string                                      | No       | The output of this test will be stored as a variable, which can be used in subsequent tests                                                 |
| options.provider      | string                                      | No       | The API provider to use for LLM rubric grading                                                                                              |
| options.rubricPrompt  | string \| string[]                          | No       | Model-graded LLM prompt                                                                                                                     |

### Assertion

More details on using assertions, including examples [here](/docs/configuration/expected-outputs).

| Property  | Type   | Required | Description                                                                                              |
| --------- | ------ | -------- | -------------------------------------------------------------------------------------------------------- |
| type      | string | Yes      | Type of assertion                                                                                        |
| value     | string | No       | The expected value, if applicable                                                                        |
| threshold | number | No       | The threshold value, applicable only to certain types such as `similar`, `cost`, `javascript`, `python`  |
| provider  | string | No       | Some assertions (type = similar, llm-rubric, model-graded-\*) require an [LLM provider](/docs/providers) |
| metric    | string | No       | The label for this result. Assertions with the same `metric` will be aggregated together                 |

:::note

promptfoo supports `.js` and `.json` extensions in addition to `.yaml`.

It automatically loads `promptfooconfig.*`, but you can use a custom config file with `promptfoo eval -c path/to/config`.

:::

## Provider-related types

### ProviderFunction

A ProviderFunction is a function that takes a prompt as an argument and returns a Promise that resolves to a ProviderResponse. It allows you to define custom logic for calling an API.

```typescript
type ProviderFunction = (
  prompt: string,
  context: { vars: Record<string, string | object> },
) => Promise<ProviderResponse>;
```

### ProviderOptions

ProviderOptions is an object that includes the `id` of the provider and an optional `config` object that can be used to pass provider-specific configurations.

```typescript
interface ProviderOptions {
  id?: ProviderId;
  config?: any;

  // List of prompt display strings
  prompts?: string[];

  // Transform the output, either with inline Javascript or external py/js script (see `Transforms`)
  transform?: string;

  // Sleep this long before each request
  delay?: number;
}
```

### ProviderResponse

ProviderResponse is an object that represents the response from a provider. It includes the output from the provider, any error that occurred, information about token usage, and a flag indicating whether the response was cached.

```typescript
interface ProviderResponse {
  error?: string;
  output?: string | object;
  tokenUsage?: Partial<{
    total: number;
    prompt: number;
    completion: number;
    cached?: number;
  }>;
  cached?: boolean;
  cost?: number; // required for cost assertion
  logProbs?: number[]; // required for perplexity assertion
}
```

### ProviderEmbeddingResponse

ProviderEmbeddingResponse is an object that represents the response from a provider's embedding API. It includes the embedding from the provider, any error that occurred, and information about token usage.

```typescript
interface ProviderEmbeddingResponse {
  error?: string;
  embedding?: number[];
  tokenUsage?: Partial<TokenUsage>;
}
```

## Evaluation inputs

### TestSuiteConfiguration

```typescript
interface TestSuiteConfig {
  // Optional description of what you're trying to test
  description?: string;

  // One or more LLM APIs to use, for example: openai:gpt-3.5-turbo, openai:gpt-4, localai:chat:vicuna
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

UnifiedConfig is an object that includes the test suite configuration, evaluation options, and command line options. It is used to hold the complete configuration for the evaluation.

```typescript
interface UnifiedConfig extends TestSuiteConfiguration {
  evaluateOptions: EvaluateOptions;
  commandLineOptions: Partial<CommandLineOptions>;
}
```

### Scenario

`Scenario` is an object that represents a group of test cases to be evaluated.
It includes a description, default test case configuration, and a list of test cases.

```typescript
interface Scenario {
  description?: string;
  config: Partial<TestCase>[];
  tests: TestCase[];
}
```

Also, see [this table here](/docs/configuration/scenarios#configuration) for descriptions.

### Prompt

A `Prompt` is what it sounds like. When specifying a prompt object in a static config, it should look like this:

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
    provider?: ApiProvider;
  }) => Promise<string | object>;
}
```

### EvaluateOptions

EvaluateOptions is an object that includes options for how the evaluation should be performed. It includes the maximum concurrency for API calls, whether to show a progress bar, a callback for progress updates, the number of times to repeat each test, and a delay between tests.

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

## Evaluation outputs

### EvaluateTable

EvaluateTable is an object that represents the results of the evaluation in a tabular format. It includes a header with the prompts and variables, and a body with the outputs and variables for each test case.

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

EvaluateTableOutput is an object that represents the output of a single evaluation in a tabular format. It includes the pass/fail result, score, output text, prompt, latency, token usage, and grading result.

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

### EvaluateSummary

EvaluateSummary is an object that represents a summary of the evaluation results. It includes the version of the evaluator, the results of each evaluation, a table of the results, and statistics about the evaluation.

```typescript
interface EvaluateSummary {
  version: number;
  timestamp: string; // ISO 8601 datetime
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
}
```

### EvaluateStats

EvaluateStats is an object that includes statistics about the evaluation. It includes the number of successful and failed tests, and the total token usage.

```typescript
interface EvaluateStats {
  successes: number;
  failures: number;
  tokenUsage: Required<TokenUsage>;
}
```

### EvaluateResult

EvaluateResult roughly corresponds to a single "cell" in the grid comparison view. It includes information on the provider, prompt, and other inputs, as well as the outputs.

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
}
```

### GradingResult

GradingResult is an object that represents the result of grading a test case. It includes whether the test case passed, the score, the reason for the result, the tokens used, and the results of any component assertions.

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
