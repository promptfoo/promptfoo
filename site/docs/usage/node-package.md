---
sidebar_position: 20
sidebar_label: Node package
description: Integrate LLM testing into Node.js apps with promptfoo's evaluate() function. Configure providers, run test suites, and analyze results using TypeScript/JavaScript APIs.
---

# Using the node package

## Installation

promptfoo is available as a node package [on npm](https://www.npmjs.com/package/promptfoo):

```sh
npm install promptfoo
```

For deeper programmatic usage, see the [Node API reference](/docs/usage/node-api-reference),
[examples](/docs/usage/node-api-examples), and
[quick reference](/docs/usage/node-api-quick-reference).

## Usage

Use `promptfoo` as a library in your project by importing the `evaluate` function and other utilities:

```ts
import promptfoo from 'promptfoo';

const evalRecord = await promptfoo.evaluate(testSuite, options);
const results = await evalRecord.toEvaluateSummary();
```

The evaluate function takes the following parameters:

- `testSuite`: the Javascript equivalent of the promptfooconfig.yaml as a [`TestSuiteConfiguration` object](/docs/configuration/reference#testsuiteconfiguration).

- `options`: misc options related to how the test harness runs, as an [`EvaluateOptions` object](/docs/configuration/reference#evaluateoptions).

The evaluate function returns an `Eval` record. Call `toEvaluateSummary()` on that record to get an [`EvaluateSummary` object](/docs/configuration/reference#evaluatesummary).

### Provider functions

A `ProviderFunction` is a Javascript function that implements an LLM API call. It takes a prompt string and a context. It returns the LLM response or an error. See [`ProviderFunction` type](/docs/configuration/reference#providerfunction).

You can load providers using the `loadApiProvider` function:

```ts
import { loadApiProvider } from 'promptfoo';

// Load a provider with default options
const provider = await loadApiProvider('openai:o3-mini');

// Load a provider with custom options
const providerWithOptions = await loadApiProvider('azure:chat:test', {
  options: {
    apiHost: 'test-host',
    apiKey: 'test-key',
  },
});
```

### Assertion functions

An `Assertion` can take an `AssertionValueFunction` as its `value`. The function receives:

- `output`: the LLM output string
- `context`: execution context, including `prompt`, `vars`, `test`, `logProbs`, `config`, `provider`, `providerResponse`, and optional `trace` data for debugging

<details>
<summary>Type definition</summary>
```typescript
type AssertionValueFunction = (
  output: string,
  context: AssertionValueFunctionContext,
) => AssertionValueFunctionResult | Promise<AssertionValueFunctionResult>;

interface AssertionValueFunctionContext {
prompt: string | undefined;
vars: Record<string, unknown>;
test: AtomicTestCase;
logProbs: number[] | undefined;
config?: Record<string, any>;
provider: ApiProvider | undefined;
providerResponse: ProviderResponse | undefined;
trace?: TraceData;
}

type AssertionValueFunctionResult = boolean | number | GradingResult;

interface GradingResult {
// Whether the test passed or failed
pass: boolean;

// Test score, typically between 0 and 1
score: number;

// Plain text reason for the result
reason: string;

// Map of labeled metrics to values
namedScores?: Record<string, number>;

// Weighted denominator for namedScores when assertion weights are used
namedScoreWeights?: Record<string, number>;

// Record of tokens usage for this assertion
tokensUsed?: Partial<{
total: number;
prompt: number;
completion: number;
cached?: number;
}>;

// Additional matcher/provider metadata
metadata?: Record<string, unknown>;

// List of results for each component of the assertion
componentResults?: GradingResult[];

// The assertion that was evaluated
assertion?: Assertion;
}

````
</details>

For more info on different assertion types, see [assertions & metrics](/docs/configuration/expected-outputs/).

### Transform functions

When using the node package, you can pass JavaScript functions directly as `transform`, `transformVars`, or `contextTransform` values — instead of string expressions or `file://` references.

This enables better IDE support, type checking, and debugging:

```ts
import promptfoo from 'promptfoo';

const evalRecord = await promptfoo.evaluate({
  prompts: ['What tools did you use to answer: {{question}}'],
  providers: ['openai:gpt-5-mini'],
  tests: [
    {
      vars: { question: 'What is 2+2?' },
      options: {
        // Transform the output before assertions
        transform: (output, context) => {
          return output.toUpperCase();
        },
      },
      assert: [
        {
          type: 'contains',
          value: 'calculator',
          // Transform just for this assertion
          transform: (output, context) => {
            const tools = context.metadata?.toolCalls ?? [];
            return tools.map((t) => t.name).join(', ');
          },
        },
      ],
    },
  ],
});
const results = await evalRecord.toEvaluateSummary();
```

Transform functions receive:

- `output`: the LLM output (string or object)
- `context`: an object containing `vars`, `prompt`, and optionally `metadata` from the provider response

:::note

Function transforms are not serializable. If you use `writeLatestResults: true`, function transforms will not be persisted in the stored config. Use string expressions or `file://` references if you need results to be fully reproducible from the stored eval.

:::

For more on transforms, see [Transforming Outputs](/docs/configuration/guide#transforming-outputs).

## Example

`promptfoo` exports an `evaluate` function that you can use to run prompt evaluations.

```js
import promptfoo from 'promptfoo';

const evalRecord = await promptfoo.evaluate(
  {
    prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
    providers: ['openai:gpt-5-mini'],
    tests: [
      {
        vars: {
          body: 'Hello world',
        },
      },
      {
        vars: {
          body: "I'm hungry",
        },
      },
    ],
    writeLatestResults: true, // write results to disk so they can be viewed in web viewer
  },
  {
    maxConcurrency: 2,
  },
);
const results = await evalRecord.toEvaluateSummary();

console.log(results);
````

This code imports the `promptfoo` library, defines the evaluation options, and then calls the `evaluate` function with these options.

You can also supply functions as `prompts`, `providers`, or `asserts`:

```js
import promptfoo from 'promptfoo';

(async () => {
  const evalRecord = await promptfoo.evaluate({
    prompts: [
      'Rephrase this in French: {{body}}',
      (vars) => {
        return `Rephrase this like a pirate: ${vars.body}`;
      },
    ],
    providers: [
      'openai:gpt-5-mini',
      (prompt, context) => {
        // Call LLM here...
        console.log(`Prompt: ${prompt}, vars: ${JSON.stringify(context.vars)}`);
        return {
          output: '<LLM output>',
        };
      },
    ],
    tests: [
      {
        vars: {
          body: 'Hello world',
        },
      },
      {
        vars: {
          body: "I'm hungry",
        },
        assert: [
          {
            type: 'javascript',
            value: (output) => {
              const pass = output.includes("J'ai faim");
              return {
                pass,
                score: pass ? 1.0 : 0.0,
                reason: pass ? 'Output contained substring' : 'Output did not contain substring',
              };
            },
          },
        ],
      },
    ],
  });
  const results = await evalRecord.toEvaluateSummary();
  console.log('RESULTS:');
  console.log(results);
})();
```

There's a full example on Github [here](https://github.com/promptfoo/promptfoo/tree/main/examples/config-node-package).

Here's the example output in JSON format:

```json
{
  "version": 3,
  "timestamp": "2026-05-02T12:43:10.000Z",
  "prompts": [
    {
      "raw": "Rephrase this in French: {{body}}",
      "label": "Rephrase this in French: {{body}}"
    }
  ],
  "results": [
    {
      "prompt": {
        "raw": "Rephrase this in French: Hello world",
        "label": "Rephrase this in French: {{body}}"
      },
      "vars": {
        "body": "Hello world"
      },
      "response": {
        "output": "Bonjour le monde",
        "tokenUsage": {
          "total": 19,
          "prompt": 16,
          "completion": 3
        }
      },
      "success": true,
      "score": 1
    }
  ],
  "stats": {
    "successes": 1,
    "failures": 0,
    "errors": 0,
    "tokenUsage": {
      "total": 19,
      "prompt": 16,
      "completion": 3
    }
  }
}
```

## Sharing Results

To get a shareable URL, set `sharing: true` along with `writeLatestResults: true`:

```js
const evalRecord = await promptfoo.evaluate({
  prompts: ['Your prompt here'],
  providers: ['openai:gpt-5-mini'],
  tests: [{ vars: { input: 'test' } }],
  writeLatestResults: true,
  sharing: true,
});
const results = await evalRecord.toEvaluateSummary();

console.log(results.shareableUrl); // https://app.promptfoo.dev/eval/abc123
```

Requires a [Promptfoo Cloud](/docs/enterprise) account or self-hosted server. For self-hosted, pass `sharing: { apiBaseUrl, appBaseUrl }` instead of `true`.
