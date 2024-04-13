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

## Run a full eval

Use `promptfoo` as a library in your project by importing the `evaluate` function:

```ts
import promptfoo from 'promptfoo';

const results = await promptfoo.evaluate(testSuite, options);
```

The evaluate function takes the following parameters:

- `testSuite`: the Javascript equivalent of the promptfooconfig.yaml as a [`TestSuiteConfiguration` object](/docs/configuration/reference#testsuiteconfiguration).

- `options`: misc options related to how the test harness runs, as an [`EvaluateOptions` object](/docs/configuration/reference#evaluateoptions).

The results of the evaluation are returned as an [`EvaluateSummary` object](/docs/configuration/reference#evaluatesummary).

### Provider functions

A `ProviderFunction` is a Javascript function that implements an LLM API call. It takes a prompt string and a context. It returns the LLM response or an error. See [`ProviderFunction` type](/docs/configuration/reference#providerfunction).

### Assertion functions

An `Assertion` can take an `AssertionFunction` as its `value`. `AssertionFunction` parameters:

- `output`: the LLM output
- `testCase`: the test case
- `assertion`: the assertion object

<details>
<summary>Type definition</summary>
```typescript
type AssertionFunction = (
  output: string,
  testCase: AtomicTestCase,
  assertion: Assertion,
) => Promise<GradingResult>;

interface GradingResult {
// Whether the test passed or failed
pass: boolean;

// Test score, typically between 0 and 1
score: number;

// Plain text reason for the result
reason: string;

// Map of labeled metrics to values
namedScores?: Record<string, number>;

// Record of tokens usage for this assertion
tokensUsed?: Partial<{
total: number;
prompt: number;
completion: number;
cached?: number;
}>;

// List of results for each component of the assertion
componentResults?: GradingResult[];

// The assertion that was evaluated
assertion: Assertion | null;
}

````
</details>

For more info on different assertion types, see [assertions & metrics](/docs/configuration/expected-outputs/).

### Example

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
    writeLatestResults: true, // write results to disk so they can be viewed in web viewer
  },
  {
    maxConcurrency: 2,
  },
);

console.log(results);
````

This code imports the `promptfoo` library, defines the evaluation options, and then calls the `evaluate` function with these options.

You can also supply functions as `prompts`, `providers`, or `asserts`:

```js
import promptfoo from 'promptfoo';

(async () => {
  const results = await promptfoo.evaluate({
    prompts: [
      'Rephrase this in French: {{body}}',
      (vars) => {
        return `Rephrase this like a pirate: ${vars.body}`;
      },
    ],
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

There's a full example on Github [here](https://github.com/typpo/promptfoo/tree/main/examples/node-package).

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

## Run an eval on existing outputs

You can use promptfoo to evaluate metrics on outputs you've already produced, without running the full evaluation pipeline. This is useful if you want to analyze the quality of outputs from an existing system or dataset.

### How to use

Use the `evaluateMetrics` function provided by `promptfoo` to run evaluations on pre-existing outputs. Here's how you can integrate this into your project:

```ts
import promptfoo from 'promptfoo';

const modelOutputs = [
  'This is the first output.',
  'This is the second output, which contains a specific substring.',
  // ...
];

const metrics = [
  {
    metric: 'Apologetic',
    type: 'llm-rubric',
    value: 'does not apologize',
  },
  {
    metric: 'Contains Expected Substring',
    type: 'contains',
    value: 'specific substring',
  },
  {
    metric: 'Is Biased',
    type: 'classifier',
    provider: 'huggingface:text-classification:d4data/bias-detection-model',
    value: 'Biased',
  },
];

const options = {
  maxConcurrency: 2,
};

(async () => {
  const evaluation = await promptfoo.evaluateMetrics(modelOutputs, metrics, options);

  evaluation.results.forEach((result) => {
    console.log('---------------------');
    console.log(`Eval for output: "${result.vars.output}"`);
    console.log('Metrics:');
    console.log(`  Overall: ${result.gradingResult.score}`);
    console.log(`  Components:`);
    for (const [key, value] of Object.entries(result.namedScores)) {
      console.log(`    ${key}: ${value}`);
    }
  });

  console.log('---------------------');
  console.log('Done.');
})();
```

### Parameters

- `modelOutputs`: An array of strings, where each string is a response output from the language model that you want to evaluate.

- `metrics`: An array of objects specifying the metrics to apply. Each metric object (a partial [Assertion](/docs/configuration/reference#assertion)) can have different properties depending on its type. Common properties include:

  - `metric`: The name of the metric.
  - `type`: The type of the metric (e.g., `contains`, `llm-rubric`, `classifier`).
  - `value`: The expected value or condition for the metric.

- `options`: Configuration [EvaluateOptions](/docs/configuration/reference#evaluateoptions) for the evaluation process, such as:
  - `maxConcurrency`: The maximum number of concurrent evaluations to perform. This helps in managing resource usage when evaluating large datasets.

### Output format

The output of the `evaluateMetrics` function is an [EvaluateSummary](/docs/configuration/reference#evaluatesummary) object that includes detailed results of the evaluation. Includes:

- `vars`: Variables used in the metric evaluation. In this case, the only variable is `output`.
- `gradingResult`: An object describing the overall grading outcome, including:
  - `score`: A numeric score representing the overall evaluation result.
  - `componentResults`: Detailed results for each component of the metric evaluated.
- `namedScores`: A breakdown of scores by individual metrics.

### Example output

Here's an example of what the output might look like when printed:

```json
{
  "results": [
    {
      "vars": {
        "output": "This is the first output."
      },
      "gradingResult": {
        "score": 0.66,
        "pass": false,
        "reason": "Output failed 1 out of 3 metrics"
      },
      "namedScores": {
        "Apologetic": 1,
        "Contains Expected Substring": 0,
        "Is Biased": 1
      }
    },
    {
      "vars": {
        "output": "This is the second output, which contains a specific substring."
      },
      "gradingResult": {
        "score": 1,
        "pass": true,
        "reason": "Output passed all metrics"
      },
      "namedScores": {
        "Apologetic": 1,
        "Contains Expected Substring": 1,
        "Is Biased": 1
      }
    }
    // ... more result objects for each output
  ],
  "stats": {
    "successes": 1,
    "failures": 1,
    "totalOutputs": 2
  }
}
```

This code loads a set of model outputs, defines several metrics to evaluate them against, and then calls `evaluateMetrics` with these outputs and metrics. It then logs the evaluation results for each output, including the overall score and the scores for each individual metric.

For a complete example, see the [metrics-posthoc.js](https://github.com/typpo/promptfoo/blob/main/examples/node-package/metrics-posthoc.js) file in the promptfoo examples directory.
