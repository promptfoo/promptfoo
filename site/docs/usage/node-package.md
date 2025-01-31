---
sidebar_position: 20
sidebar_label: Node package
---

# Node Package

## Quick Start

```sh
npm install promptfoo
```

```ts
import { evaluate } from 'promptfoo';

const results = await evaluate({
  prompts: ['Translate to French: {{text}}'],
  providers: ['openai:gpt-4'],
  tests: [{ vars: { text: 'Hello world' } }],
});
```

## Package Requirements

- Node.js v18.0.0+
- Provider API keys (e.g., `OPENAI_API_KEY`)
- Optional provider dependencies installed automatically

## Core Concepts

### Evaluation

The main functionality for testing LLM prompts:

```ts
import { evaluate } from 'promptfoo';

// Using a config file
const results = await evaluate({
  configPath: './promptfooconfig.yaml',
  maxConcurrency: 2,
});

// Or using inline configuration
const results = await evaluate({
  prompts: ['...'],
  providers: ['...'],
  tests: [{...}],
});
```

See: [Configuration Reference](/docs/configuration/reference#testsuiteconfiguration)

### Providers

Load and configure LLM providers:

```ts
import { providers } from 'promptfoo';

// Single provider
const openai = await providers.loadApiProvider('openai:gpt-4');

// Multiple providers
const allProviders = await providers.loadApiProviders([
  'openai:gpt-4',
  'anthropic:claude-2',
  // Custom provider
  async (prompt) => ({ output: 'Custom response' }),
]);
```

### Assertions

Validate LLM outputs:

```ts
import { assertions } from 'promptfoo';

const testCase = {
  assert: [
    // Basic assertions
    { type: 'contains', value: 'expected text' },
    { type: 'regex', value: /pattern/ },

    // Advanced assertions
    {
      type: 'javascript',
      value: assertions.similarity('reference text', 0.8),
    },
    {
      type: 'javascript',
      value: assertions.contains(['required', 'words']),
    },
  ],
};
```

See: [Assertions & Metrics](/docs/configuration/expected-outputs/)

### Caching

Optimize API usage with built-in caching:

```ts
import { cache } from 'promptfoo';

// Cache control
cache.enableCache();
cache.disableCache();
await cache.clearCache();

// HTTP requests with caching
const response = await cache.fetchWithCache(
  'https://api.example.com/data',
  { headers: { ... } },
  5000,  // timeout
  'json' // format
);
```

Configuration via environment:

- `PROMPTFOO_CACHE_ENABLED`: true/false (default: true)
- `PROMPTFOO_CACHE_TYPE`: 'memory'/'disk' (default: 'disk')
- `PROMPTFOO_CACHE_TTL`: seconds (default: 14 days)
- `PROMPTFOO_CACHE_PATH`: custom cache location

## Advanced Usage

### Error Handling

```ts
try {
  const results = await evaluate({...});
} catch (error) {
  if (error instanceof ProviderError) {
    // Handle LLM API errors
  } else if (error instanceof ValidationError) {
    // Handle configuration errors
  } else if (error instanceof AssertionError) {
    // Handle assertion failures
  }
}
```

### Custom Provider Implementation

```ts
const customProvider = await providers.loadApiProvider(async (prompt, context) => {
  // Access test variables
  const vars = context.vars;

  // Custom LLM implementation
  const response = await yourLLM.generate(prompt);

  return {
    output: response.text,
    tokenUsage: {
      total: response.usage.total_tokens,
      prompt: response.usage.prompt_tokens,
      completion: response.usage.completion_tokens,
    },
  };
});
```

### Custom Assertions

```ts
const customAssertion = {
  type: 'javascript',
  value: async (output, testCase, assertion) => {
    const pass = // your logic
    return {
      pass,
      score: pass ? 1 : 0,
      reason: 'Explanation of result',
    };
  },
};
```

## Package Details

### Module System

```ts
// CommonJS
const { evaluate } = require('promptfoo');

// ESM
import { evaluate } from 'promptfoo';

// TypeScript
import type {
  TestSuiteConfiguration,
  EvaluateOptions,
  EvaluateSummary
} from 'promptfoo';
```

### Build Information

- Full TypeScript support with declarations
- Source maps included
- CommonJS format
- Both `require`/`import` supported

## Complete Examples

### Basic Evaluation

```ts
import promptfoo from 'promptfoo';

// Basic evaluation with multiple prompts and test cases
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
        assert: [
          {
            type: 'javascript',
            value: promptfoo.assertions.contains(["J'ai faim"]),
          },
        ],
      },
    ],
    writeLatestResults: true, // write results to disk so they can be viewed in web viewer
  },
  {
    maxConcurrency: 2, // Limit concurrent API calls
  },
);

// Access evaluation results
console.log(
  `Success rate: ${results.stats.successes}/${results.stats.successes + results.stats.failures}`,
);
console.log(`Token usage: ${results.stats.tokenUsage.total} tokens`);
```

### Advanced Usage with Functions

```ts
import promptfoo from 'promptfoo';

const results = await promptfoo.evaluate({
  // Dynamic prompts using functions
  prompts: [
    'Rephrase this in French: {{body}}',
    (vars) => {
      return `Rephrase this like a pirate: ${vars.body}`;
    },
  ],
  // Multiple provider types
  providers: [
    'openai:gpt-4o-mini',
    (prompt, context) => {
      // Custom provider implementation
      console.log(`Prompt: ${prompt}, vars: ${JSON.stringify(context.vars)}`);
      return {
        output: '<LLM output>',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
        },
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
```

### Example Output

The evaluation results include detailed information about each test:

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
        "raw": "Rephrase this in French: I'm hungry",
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

### TypeScript Examples

#### Basic TypeScript Usage

```typescript
import { evaluate, type TestSuiteConfiguration, type EvaluateOptions } from 'promptfoo';

const config: TestSuiteConfiguration = {
  prompts: ['Translate to {{language}}: {{text}}'],
  providers: ['openai:gpt-4'],
  tests: [
    {
      vars: {
        language: 'French',
        text: 'Hello world',
      },
      assert: [
        {
          type: 'contains',
          value: 'Bonjour',
        },
      ],
    },
  ],
};

const options: EvaluateOptions = {
  maxConcurrency: 2,
  showProgressBar: true,
};

// Results are fully typed
const results = await evaluate(config, options);
console.log(`Passed tests: ${results.stats.successes}`);
```

#### Advanced TypeScript with Custom Types

```typescript
import {
  type TestSuiteConfiguration,
  type ProviderFunction,
  type AtomicTestCase,
  type Assertion,
  type GradingResult,
  assertions,
} from 'promptfoo';

// Custom provider with type safety
const customProvider: ProviderFunction = async (prompt: string, context) => {
  const response = await fetch('https://api.your-llm.com', {
    method: 'POST',
    body: JSON.stringify({ prompt, context }),
  });

  const data = await response.json();
  return {
    output: data.text,
    tokenUsage: {
      total: data.usage.total_tokens,
      prompt: data.usage.prompt_tokens,
      completion: data.usage.completion_tokens,
    },
  };
};

// Custom assertion with type safety
const customAssertion: Assertion = {
  type: 'javascript',
  value: async (
    output: string,
    testCase: AtomicTestCase,
    assertion: Assertion,
  ): Promise<GradingResult> => {
    const expectedLength = testCase.vars?.expectedLength as number;
    const pass = output.length === expectedLength;

    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? `Output length ${output.length} matches expected length`
        : `Output length ${output.length} does not match expected length ${expectedLength}`,
    };
  },
};

// Full configuration with types
const config: TestSuiteConfiguration = {
  prompts: [
    // Static prompt
    'Generate a {{length}} word story about {{topic}}',
    // Function prompt with type safety
    (vars: Record<string, unknown>) => {
      return `Tell me a ${vars.length} word story about ${vars.topic}`;
    },
  ],
  providers: ['openai:gpt-4', customProvider],
  tests: [
    {
      vars: {
        length: 50,
        topic: 'space exploration',
        expectedLength: 50,
      },
      assert: [
        customAssertion,
        {
          type: 'javascript',
          value: assertions.contains(['space', 'explore']),
        },
      ],
    },
  ],
};

const results = await evaluate(config);
```

For more examples, check out our [examples repository](https://github.com/promptfoo/promptfoo/tree/main/examples/node-package).

## Related

- [Configuration Reference](/docs/configuration/reference)
- [Assertions & Metrics](/docs/configuration/expected-outputs/)
- [LLM Red Teaming Guide](/docs/guides/llm-redteaming)
- [FAQ](/docs/faq)
