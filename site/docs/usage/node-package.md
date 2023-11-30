---
sidebar_position: 20
sidebar_label: Node package
---

# Using the node package

## Installation

promptfoo is available as a node package [on npm](https://www.npmjs.com/package/promptfoo):

```
npm install promptfoo
```

## Usage

Use `promptfoo` as a library in your project by importing the `evaluate` function:

```ts
import promptfoo from 'promptfoo';

const results = await promptfoo.evaluate(testSuite, options);
```

The evaluate function takes the following parameters:

- `testSuite`: the Javascript equivalent of the promptfooconfig.yaml

  ```typescript
  interface TestSuiteConfig {
    // Optional description of what your LLM is trying to do
    description?: string;

    // One or more LLM APIs to use, for example: openai:gpt-3.5-turbo, openai:gpt-4, localai:chat:vicuna
    providers: ProviderId | ProviderId[] | RawProviderConfig[] | ProviderFunction;

    // One or more prompt files to load
    prompts: string | string[];

    // Path to a test file, OR list of LLM prompt variations (aka "test case")
    tests: string | string[] | TestCase[];

    // Sets the default properties for each test case. Useful for setting an assertion, on all test cases, for example.
    defaultTest?: Omit<TestCase, 'description'>;

    // Paths to write output. Writes to console/web viewer if not set.
    outputPath?: string | string[];

    // Determines whether or not sharing is enabled.
    sharing?: boolean;
  }

  interface TestCase {
    // Optional description of what you're testing
    description?: string;

    // Key-value pairs to substitute in the prompt
    vars?: Record<string, string | string[] | object>;

    // Optional filepath or glob pattern to load vars from
    loadVars?: string | string[];

    // Optional list of automatic checks to run on the LLM output
    assert?: Assertion[];

    // Additional configuration settings for the prompt
    options?: PromptConfig & OutputConfig & GradingConfig;
  }

  interface Assertion {
    type:
      | 'equals'
      | 'contains'
      | 'icontains'
      | 'contains-all'
      | 'contains-any'
      | 'starts-with'
      | 'regex'
      | 'is-json'
      | 'contains-json'
      | 'javascript'
      | 'similar'
      | 'llm-rubric'
      | 'webhook'
      | 'rouge-n'
      | 'rouge-s'
      | 'rouge-l';

    // The expected value, if applicable
    value?: string | string[] | AssertionFunction;

    // The threshold value, only applicable for similarity (cosine distance)
    threshold?: number;

    // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
    weight?: number;

    // Some assertions (similarity, llm-rubric) require an LLM provider
    provider?: ApiProvider;
  }
  ```

- `options`: misc options related to how the tests are run

  ```typescript
  interface EvaluateOptions {
    maxConcurrency?: number;
    delay?: number;
    showProgressBar?: boolean;
  }
  ```

### Provider functions

A `ProviderFunction` is a Javascript function that implements an LLM API call. It takes a prompt string and a context. It returns the LLM response or an error:

```typescript
type ProviderFunction = (
  prompt: string,
  context: { vars: Record<string, string | object> },
) => Promise<ProviderResponse>;

interface ProviderResponse {
  error?: string;
  output?: string;
}
```

### Assertion functions

An `Assertion` can take an `AssertionFunction` as its `value`. `AssertionFunction` has the following type:

```typescript
type AssertionFunction = (
  output: string,
  testCase: AtomicTestCase,
  assertion: Assertion,
) => Promise<GradingResult>;

interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}
```

`AssertionFunction` parameters:

- `output`: the LLM output
- `testCase`: the test case
- `assertion`: the assertion object

## Example

`promptfoo` exports an `evaluate` function that you can use to run prompt evaluations.

```js
import promptfoo from 'promptfoo';

const results = await promptfoo.evaluate(
  {
    prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
    providers: ['openai:gpt-3.5-turbo'],
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
  },
  {
    maxConcurrency: 2,
  },
);

console.log(results);
```

This code imports the `promptfoo` library, defines the evaluation options, and then calls the `evaluate` function with these options.

You can also supply functions as `providers` or `asserts`:

```js
import promptfoo from '../../dist/src/index.js';

(async () => {
  const results = await promptfoo.evaluate({
    prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
    providers: [
      'openai:gpt-3.5-turbo',
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
  console.log('RESULTS:');
  console.log(results);
})();
```

See the full example [here](https://github.com/typpo/promptfoo/tree/main/examples/node-package).

Here's the example output in JSON format:

```json
{
  "results": [
    {
      "prompt": {
        "raw": "Rephrase this in French: Hello world",
        "display": "Rephrase this in French: {{body}}"
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
      }
    },
    {
      "prompt": {
        "raw": "Rephrase this in French: I&#39;m hungry",
        "display": "Rephrase this in French: {{body}}"
      },
      "vars": {
        "body": "I'm hungry"
      },
      "response": {
        "output": "J'ai faim.",
        "tokenUsage": {
          "total": 24,
          "prompt": 19,
          "completion": 5
        }
      }
    }
    // ...
  ],
  "stats": {
    "successes": 4,
    "failures": 0,
    "tokenUsage": {
      "total": 120,
      "prompt": 72,
      "completion": 48
    }
  },
  "table": [
    ["Rephrase this in French: {{body}}", "Rephrase this like a pirate: {{body}}", "body"],
    ["Bonjour le monde", "Ahoy thar, me hearties! Avast ye, world!", "Hello world"],
    [
      "J'ai faim.",
      "Arrr, me belly be empty and me throat be parched! I be needin' some grub, matey!",
      "I'm hungry"
    ]
  ]
}
```
