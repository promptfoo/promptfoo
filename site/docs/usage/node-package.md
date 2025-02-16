---
sidebar_position: 20
sidebar_label: Node package
---

# Using the node package

## Installation

promptfoo is available as a node package [on npm](https://www.npmjs.com/package/promptfoo):

```sh
npm install promptfoo
```

## Usage

Use `promptfoo` as a library in your project by importing the `evaluate` function:

```ts
import promptfoo from 'promptfoo';

const results = await promptfoo.evaluate(testSuite, options);
```

The evaluate function takes the following parameters:

- `testSuite`: the Javascript equivalent of the promptfooconfig.yaml as a [`TestSuiteConfiguration` object](/docs/configuration/reference#testsuiteconfiguration). The configuration can include:

  - `sharing`: Enable sharing functionality to generate a shareable URL for the evaluation results. Can be:
    - `boolean`: When `true`, generates a shareable URL using default settings
    - `object`: Configure sharing with custom settings:
      ```typescript
      type SharingConfig = {
        apiBaseUrl?: string; // Custom API endpoint for sharing service
        appBaseUrl?: string; // Custom web viewer URL
      };
      ```
      Note:
    - Sharing must be enabled in both the test suite and unified configuration to generate a URL
    - If sharing service is unavailable, `shareUrl` will be `null` and a warning will be logged
    - When `writeLatestResults` is true, results will be saved to disk before generating the share URL

- `options`: misc options related to how the test harness runs, as an [`EvaluateOptions` object](/docs/configuration/reference#evaluateoptions).

The evaluate function returns a Promise that resolves to an evaluation result object containing:

- All properties from the [`EvaluateSummary` object](/docs/configuration/reference#evaluatesummary)
- `shareUrl`: A string containing the shareable URL when sharing is enabled and successful, or null when:
  - Sharing is disabled (either in test suite or unified config)
  - Sharing service is unavailable
  - URL generation fails

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

## Example

Here's a complete example showing various features including sharing:

```js
import promptfoo from 'promptfoo';

const results = await promptfoo.evaluate(
  {
    prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
    providers: ['openai:gpt-4o-mini'],
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
    sharing: {
      // Optional: customize sharing endpoints
      apiBaseUrl: 'https://api.example.com',
      appBaseUrl: 'https://viewer.example.com'
    },
  },
  {
    maxConcurrency: 2,
  },
);

// Access the shareable URL if sharing is enabled and successful
if (results.shareUrl) {
  console.log('View results at:', results.shareUrl);
}

console.log(results);
```

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
      'openai:gpt-4o-mini',
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
    sharing: {
      apiBaseUrl: 'https://api.example.com',
      appBaseUrl: 'https://viewer.example.com'
    },
  });
  console.log('RESULTS:');
  console.log(results);

  if (results.shareUrl) {
    console.log('View results at:', results.shareUrl);
  }
})();
```

There's a full example on Github [here](https://github.com/promptfoo/promptfoo/tree/main/examples/node-package).

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
````
