---
sidebar_position: 50
---

# Custom Javascript

To create a custom API provider, implement the `ApiProvider` interface in a separate module. Here is the interface:

```ts
export interface CallApiContextParams {
  vars: Record<string, string | object>;
}

export interface CallApiOptionsParams {
  // Whether to include logprobs in API response (used with OpenAI providers)
  includeLogProbs?: boolean;

  // Used when provider is overridden on the test case.
  originalProvider?: ApiProvider;
}

export interface ApiProvider {
  constructor(options: { id?: string; config: Record<string, any> });

  // Unique identifier for the provider
  id: () => string;

  // Text generation function
  callApi: (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) => Promise<ProviderResponse>;

  // Embedding function
  callEmbeddingApi?: (prompt: string) => Promise<ProviderEmbeddingResponse>;

  // Classification function
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;

  // Shown on output UI
  label?: ProviderLabel;

  // Applied by the evaluator on provider response
  transform?: string;

  // Custom delay for the provider.
  delay?: number;
}
```

See also: [ProviderResponse](/docs/configuration/reference/#providerresponse)

## Example

Here's an example of a custom API provider that returns a predefined output along with token usage:

```javascript
import fetch from 'node-fetch';

class CustomApiProvider {
  constructor(options) {
    // Provider ID can be overridden by the config file (e.g. when using multiple of the same provider)
    this.providerId = options.id || 'custom provider';

    // options.config contains any custom options passed to the provider
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    // Add your custom API logic here
    // Use options like: `this.config.temperature`, `this.config.max_tokens`, etc.

    console.log('Vars for this test case:', JSON.stringify(context.vars));

    return {
      // Required
      output: 'Model output',

      // Optional
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    };
  }
}

module.exports = CustomApiProvider;
```

Custom API providers can also be used for embeddings or classification.

```javascript
module.exports = class CustomApiProvider {
  constructor(options) {
    this.providerId = options.id || 'custom provider';
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  // or embeddings:
  async callEmbeddingApi(prompt) {
    // Add your custom embedding logic here
    return {
      embedding: [], // Your embedding array
      tokenUsage: { total: 10, prompt: 1, completion: 0 },
    };
  }
  // or classification
  async callClassificationApi(prompt) {
    // Add your custom classification logic here
    return {
      classification: {
        classA: 0.6,
        classB: 0.4,
      },
    };
  }
};
```

### Caching

You can interact with promptfoo's cache by importing the `promptfoo.cache` module. For example:

```js
const promptfoo = require('../../dist/src/index.js').default;

const cache = promptfoo.cache.getCache();
await cache.set('foo', 'bar');
console.log(await cache.get('foo')); // "bar"
```

The cache is managed by [`cache-manager`](https://www.npmjs.com/package/cache-manager/v/4.1.0).

promptfoo also has built-in utility functions for fetching with cache and timeout:

```js
const { data, cached } = await promptfoo.cache.fetchWithCache(
  'https://api.openai.com/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  },
  10_000, // 10 second timeout
);

console.log('Got from OpenAI:', data);
console.log('Was it cached?', cached);
```

## Using the provider

Include the custom provider in promptfoo config:

```yaml
providers: ['file://relative/path/to/customApiProvider.js']
```

Alternatively, you can pass the path to the custom API provider directly in the CLI:

```
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv -v vars.csv -r ./customApiProvider.js
```

This command will evaluate the prompts using the custom API provider and save the results to the specified CSV file.

A full working example is available in the [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-provider).
A full working example for an embedding provider can also be found in the [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-provider-embeddings).

## Multiple instances of the same provider

You can instantiate multiple providers of the same type with distinct IDs. In this example, we pass a different temperature config to the provider:

```yaml
providers:
  - id: file:///absolute/path/to/customProvider.js
    label: custom-provider-hightemp
    config:
      temperature: 1.0
  - id: file:///absolute/path/to/customProvider.js
    label: custom-provider-lowtemp
    config:
      temperature: 0
```

### ES modules

ES modules are supported, but must have a `.mjs` file extension. Alternatively, if you are transpiling Javascript or Typescript, we recommend pointing promptfoo to the transpiled plain Javascript output.
