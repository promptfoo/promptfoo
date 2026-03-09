---
sidebar_position: 2
sidebar_label: Reference
title: Configuration Reference - Complete API Documentation
description: Reference for all promptfoo YAML configuration properties including top-level config, test cases, assertions, and CLI options.
keywords:
  [
    promptfoo reference,
    configuration API,
    evaluation options,
    provider settings,
    test configuration,
    assertion types,
  ]
pagination_prev: configuration/guide
pagination_next: configuration/extensions
---

# Configuration Reference

This page documents all properties available in `promptfooconfig.yaml`. See also:

- [Extension Hooks](/docs/configuration/extensions) for custom evaluation lifecycle logic
- [TypeScript Types](/docs/configuration/types) for programmatic API type definitions

## Config

| Property                        | Type                                                                                                                      | Required | Description                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| description                     | string                                                                                                                    | No       | Optional description of what your LLM is trying to do                                                                                                                                     |
| tags                            | Record\<string, string\>                                                                                                  | No       | Optional tags to describe the test suite (e.g. `env: production`, `application: chatbot`)                                                                                                 |
| providers                       | string \| string[] \| [Record\<string, ProviderOptions\>](/docs/configuration/types#provideroptions) \| ProviderOptions[] | Yes      | One or more [LLM APIs](/docs/providers) to use. Can also be specified as `targets`                                                                                                        |
| prompts                         | string \| string[]                                                                                                        | Yes      | One or more [prompts](/docs/configuration/prompts) to load                                                                                                                                |
| tests                           | string \| [Test Case](#test-case)[]                                                                                       | Yes      | Path to a [test file](/docs/configuration/test-cases), OR list of LLM prompt variations (aka "test case")                                                                                 |
| defaultTest                     | string \| Partial [Test Case](#test-case)                                                                                 | No       | Sets the [default properties](/docs/configuration/guide#default-test-cases) for each test case. Can be an inline object or a `file://` path to an external YAML/JSON file.                |
| outputPath                      | string                                                                                                                    | No       | Where to write output. Writes to console/web viewer if not set. See [output formats](/docs/configuration/outputs).                                                                        |
| evaluateOptions.maxConcurrency  | number                                                                                                                    | No       | Maximum number of concurrent requests. Defaults to 4                                                                                                                                      |
| evaluateOptions.repeat          | number                                                                                                                    | No       | Number of times to run each test case. Defaults to 1                                                                                                                                      |
| evaluateOptions.delay           | number                                                                                                                    | No       | Force the test runner to wait after each API call (milliseconds)                                                                                                                          |
| evaluateOptions.showProgressBar | boolean                                                                                                                   | No       | Whether to display the progress bar                                                                                                                                                       |
| evaluateOptions.cache           | boolean                                                                                                                   | No       | Whether to use disk [cache](/docs/configuration/caching) for results (default: true)                                                                                                      |
| evaluateOptions.timeoutMs       | number                                                                                                                    | No       | Timeout in milliseconds for each individual test case/provider API call. When reached, that specific test is marked as an error. Default is 0 (no timeout).                               |
| evaluateOptions.maxEvalTimeMs   | number                                                                                                                    | No       | Maximum total runtime in milliseconds for the entire evaluation process. When reached, all remaining tests are marked as errors and the evaluation ends. Default is 0 (no limit).         |
| extensions                      | string[]                                                                                                                  | No       | List of [extension files](/docs/configuration/extensions) to load. Supported hooks are 'beforeAll', 'afterAll', 'beforeEach', 'afterEach'.                                                |
| env                             | Record\<string, string \| number \| boolean\>                                                                             | No       | Environment variables to set for the test run. These values will override existing environment variables. Can be used to set API keys and other configuration values needed by providers. |
| commandLineOptions              | [CommandLineOptions](#commandlineoptions)                                                                                 | No       | Default values for command-line options. These values will be used unless overridden by actual command-line arguments.                                                                    |

:::note

promptfoo supports `.js` and `.json` file extensions in addition to `.yaml`.

It automatically loads `promptfooconfig.*`, but you can use a custom config file with `promptfoo eval -c path/to/config`.

:::

## Test Case

A test case represents a single example input that is fed into all prompts and providers.

| Property                      | Type                                                            | Required | Description                                                                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| description                   | string                                                          | No       | Description of what you're testing                                                                                                                                                                                                     |
| vars                          | Record\<string, string \| string[] \| object \| any\> \| string | No       | Key-value pairs to substitute in the prompt. If `vars` is a plain string, it will be treated as a YAML filepath to load a var mapping from. See [Test Case Configuration](/docs/configuration/test-cases) for loading vars from files. |
| provider                      | string \| ProviderOptions \| ApiProvider                        | No       | Override the default [provider](/docs/providers) for this specific test case                                                                                                                                                           |
| providers                     | string[]                                                        | No       | Filter which providers this test runs against. Supports labels, IDs, and wildcards (e.g., `openai:*`). See [filtering tests by provider](/docs/configuration/test-cases#filtering-tests-by-provider).                                  |
| prompts                       | string[]                                                        | No       | Filter this test to run only with specific prompts (by label or ID). Supports wildcards like `Math:*`. See [Filtering Tests by Prompt](/docs/configuration/test-cases#filtering-tests-by-prompt).                                      |
| assert                        | [Assertion](#assertion)[]                                       | No       | List of automatic checks to run on the LLM output. See [assertions & metrics](/docs/configuration/expected-outputs) for all available types.                                                                                           |
| threshold                     | number                                                          | No       | Test will fail if the combined score of assertions is less than this number                                                                                                                                                            |
| metadata                      | Record\<string, string \| string[] \| any\>                     | No       | Additional metadata to include with the test case, useful for [filtering](/docs/configuration/test-cases#metadata-in-csv) or grouping results                                                                                          |
| options                       | Object                                                          | No       | Additional configuration settings for the test case                                                                                                                                                                                    |
| options.transformVars         | string                                                          | No       | A filepath (js or py) or JavaScript snippet that runs on the vars before they are substituted into the prompt. See [transforming input variables](/docs/configuration/guide#transforming-input-variables).                             |
| options.transform             | string                                                          | No       | A filepath (js or py) or JavaScript snippet that runs on LLM output before any assertions. See [transforming outputs](/docs/configuration/guide#transforming-outputs).                                                                 |
| options.prefix                | string                                                          | No       | Text to prepend to the prompt                                                                                                                                                                                                          |
| options.suffix                | string                                                          | No       | Text to append to the prompt                                                                                                                                                                                                           |
| options.provider              | string                                                          | No       | The API provider to use for [model-graded](/docs/configuration/expected-outputs/model-graded) assertion grading                                                                                                                        |
| options.runSerially           | boolean                                                         | No       | If true, run this test case without concurrency regardless of global settings                                                                                                                                                          |
| options.storeOutputAs         | string                                                          | No       | The output of this test will be stored as a variable, which can be used in subsequent tests. See [multi-turn conversations](/docs/configuration/chat#using-storeoutputas).                                                             |
| options.rubricPrompt          | string \| string[]                                              | No       | Custom prompt for [model-graded](/docs/configuration/expected-outputs/model-graded) assertions                                                                                                                                         |
| options.\<provider-specific\> | any                                                             | No       | Provider-specific config fields (e.g., `response_format`, `responseSchema`) are passed through to the provider. Use `file://` to load from external files. See [Per-test provider config](#per-test-provider-config).                  |

### Per-test provider config {#per-test-provider-config}

Test-level `options` can include provider-specific configuration fields that override the provider's default config for that specific test. This is useful for:

- Using different structured output schemas per test
- Varying temperature or other parameters for specific test cases
- Testing the same prompt with different model configurations

```yaml
tests:
  - vars:
      question: 'What is 2 + 2?'
    options:
      # Provider-specific: loaded from external file
      response_format: file://./schemas/math-response.json
      # Provider-specific: inline override
      temperature: 0
```

The external file must contain the complete configuration object. For OpenAI structured outputs:

```json title="schemas/math-response.json"
{
  "type": "json_schema",
  "json_schema": {
    "name": "math_response",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "answer": { "type": "number" },
        "explanation": { "type": "string" }
      },
      "required": ["answer", "explanation"],
      "additionalProperties": false
    }
  }
}
```

See the [OpenAI structured outputs guide](/docs/providers/openai#using-response_format) for more details.

## Assertion

More details on using assertions, including examples [here](/docs/configuration/expected-outputs).

| Property         | Type   | Required | Description                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| type             | string | Yes      | Type of assertion. See [assertion types](/docs/configuration/expected-outputs#assertion-types) for all available types.                                                                                                                                                                                              |
| value            | string | No       | The expected value, if applicable                                                                                                                                                                                                                                                                                    |
| threshold        | number | No       | The threshold value, applicable only to certain types such as [`similar`](/docs/configuration/expected-outputs/similar), [`cost`](/docs/configuration/expected-outputs/deterministic#cost), [`javascript`](/docs/configuration/expected-outputs/javascript), [`python`](/docs/configuration/expected-outputs/python) |
| provider         | string | No       | Some assertions (type = [`similar`](/docs/configuration/expected-outputs/similar), [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric), [model-graded-\*](/docs/configuration/expected-outputs/model-graded)) require an [LLM provider](/docs/providers)                                    |
| metric           | string | No       | The label for this result. Assertions with the same `metric` will be aggregated together. See [named metrics](/docs/configuration/expected-outputs#defining-named-metrics).                                                                                                                                          |
| contextTransform | string | No       | Javascript expression to dynamically construct context for [context-based assertions](/docs/configuration/expected-outputs/model-graded#context-based). See [Context Transform](/docs/configuration/expected-outputs/model-graded#dynamically-via-context-transform) for more details.                               |

## AssertionValueFunctionContext

When using [JavaScript](/docs/configuration/expected-outputs/javascript) or [Python](/docs/configuration/expected-outputs/python) assertions, your function receives a context object with the following interface:

```typescript
interface AssertionValueFunctionContext {
  // Raw prompt sent to LLM
  prompt: string | undefined;

  // Test case variables
  vars: Record<string, string | object>;

  // The complete test case (see #test-case)
  test: AtomicTestCase;

  // Log probabilities from the LLM response, if available
  logProbs: number[] | undefined;

  // Configuration passed to the assertion
  config?: Record<string, any>;

  // The provider that generated the response (see /docs/providers)
  provider: ApiProvider | undefined;

  // The complete provider response (see /docs/configuration/types#providerresponse)
  providerResponse: ProviderResponse | undefined;
}
```

## CommandLineOptions

Set default values for command-line options. These defaults will be used unless overridden by command-line arguments.

| Property                 | Type               | Description                                                                                                           |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Basic Configuration**  |                    |                                                                                                                       |
| description              | string             | Description of what your LLM is trying to do                                                                          |
| config                   | string[]           | Path(s) to configuration files                                                                                        |
| envPath                  | string \| string[] | Path(s) to .env file(s). When multiple files are specified, later files override earlier values.                      |
| **Input Files**          |                    |                                                                                                                       |
| prompts                  | string[]           | One or more paths to [prompt files](/docs/configuration/prompts)                                                      |
| providers                | string[]           | One or more [LLM provider](/docs/providers) identifiers                                                               |
| tests                    | string             | Path to CSV file with [test cases](/docs/configuration/test-cases)                                                    |
| vars                     | string             | Path to CSV file with test variables                                                                                  |
| assertions               | string             | Path to [assertions](/docs/configuration/expected-outputs) file                                                       |
| modelOutputs             | string             | Path to JSON file containing model outputs                                                                            |
| **Prompt Modifications** |                    |                                                                                                                       |
| promptPrefix             | string             | Text to prepend to every prompt                                                                                       |
| promptSuffix             | string             | Text to append to every prompt                                                                                        |
| generateSuggestions      | boolean            | Generate new prompts and append them to the prompt list                                                               |
| **Test Execution**       |                    |                                                                                                                       |
| maxConcurrency           | number             | Maximum number of concurrent requests                                                                                 |
| repeat                   | number             | Number of times to run each test case                                                                                 |
| delay                    | number             | Delay between API calls in milliseconds                                                                               |
| grader                   | string             | [Provider](/docs/providers) that will grade [model-graded](/docs/configuration/expected-outputs/model-graded) outputs |
| var                      | object             | Set test variables as key-value pairs (e.g. `{key1: 'value1', key2: 'value2'}`)                                       |
| **Filtering**            |                    |                                                                                                                       |
| filterPattern            | string             | Only run tests whose description matches the regular expression pattern                                               |
| filterProviders          | string             | Only run tests with providers matching this regex (matches against provider `id` or `label`)                          |
| filterTargets            | string             | Only run tests with targets matching this regex (alias for filterProviders)                                           |
| filterFirstN             | number             | Only run the first N test cases                                                                                       |
| filterSample             | number             | Run a random sample of N test cases                                                                                   |
| filterMetadata           | string             | Only run tests matching metadata filter (JSON format)                                                                 |
| filterErrorsOnly         | string             | Only run tests that resulted in errors (expects previous output path)                                                 |
| filterFailing            | string             | Only run tests that failed assertions (expects previous output path)                                                  |
| **Output & Display**     |                    |                                                                                                                       |
| output                   | string[]           | [Output file](/docs/configuration/outputs) paths (csv, txt, json, yaml, yml, html)                                    |
| table                    | boolean            | Show output table (default: true, disable with --no-table)                                                            |
| tableCellMaxLength       | number             | Maximum length of table cells in console output                                                                       |
| progressBar              | boolean            | Whether to display progress bar during evaluation                                                                     |
| verbose                  | boolean            | Enable verbose output                                                                                                 |
| share                    | boolean            | Whether to create a shareable URL                                                                                     |
| **Caching & Storage**    |                    |                                                                                                                       |
| cache                    | boolean            | Whether to use disk [cache](/docs/configuration/caching) for results (default: true)                                  |
| write                    | boolean            | Whether to write results to promptfoo directory (default: true)                                                       |
| **Other Options**        |                    |                                                                                                                       |
| watch                    | boolean            | Whether to watch for config changes and re-run automatically                                                          |

### Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - prompt1.txt
  - prompt2.txt

providers:
  - openai:gpt-5

tests: tests.csv

# Set default command-line options
commandLineOptions:
  envPath: # Load from multiple .env files (later overrides earlier)
    - .env
    - .env.local
  maxConcurrency: 10
  repeat: 3
  delay: 1000
  verbose: true
  grader: openai:gpt-5-mini
  table: true
  cache: false
  tableCellMaxLength: 100

  # Filtering options
  filterPattern: 'auth.*' # Only run tests with 'auth' in description
  filterProviders: 'openai.*' # Only test OpenAI providers
  filterSample: 50 # Random sample of 50 tests

  # Prompt modifications
  promptPrefix: 'You are a helpful assistant. '
  promptSuffix: "\n\nPlease be concise."

  # Variables
  var:
    temperature: '0.7'
    max_tokens: '1000'
```

With this configuration, running `npx promptfoo eval` will use these defaults. You can still override them:

```bash
# Uses maxConcurrency: 10 from config
npx promptfoo eval

# Overrides maxConcurrency to 5
npx promptfoo eval --max-concurrency 5
```
