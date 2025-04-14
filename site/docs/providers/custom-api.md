---
sidebar_label: Custom Javascript
---

# Javascript Provider

Custom Javascript providers let you create providers in JavaScript or TypeScript to integrate with any API or service not already built into promptfoo.

## Supported File Formats and Examples

promptfoo supports multiple JavaScript module formats. Complete working examples are available on GitHub:

- [CommonJS Provider](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-provider) - (`.js`, `.cjs`) - Uses `module.exports` and `require()`
- [ESM Provider](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-provider-mjs) - (`.mjs`, `.js` with `"type": "module"`) - Uses `import`/`export`
- [TypeScript Provider](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-provider-typescript) - (`.ts`) - Provides type safety with interfaces
- [Embeddings Provider](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-provider-embeddings) (commonjs)

## Provider Interface

At minimum, a custom provider must implement an `id` method and a `callApi` method.

```javascript title="echoProvider.js"
export default class EchoProvider {
  id = () => 'echo';

  callApi = async (prompt, context, options) => {
    return {
      output: `Echo: ${prompt}`,
    };
  };
}
```

You can optionally use a constructor to initialize the provider, for example:

```javascript title="openaiProvider.js"
const promptfoo = require('promptfoo').default;

module.exports = class OpenAIProvider {
  constructor(options) {
    this.providerId = options.id || 'openai-custom';
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context, options) {
    const { data } = await promptfoo.cache.fetchWithCache(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.config?.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: this.config?.max_tokens || 1024,
          temperature: this.config?.temperature || 0,
        }),
      },
    );

    return {
      output: data.choices[0].message.content,
      tokenUsage: data.usage,
    };
  }
};
```

`callApi` returns a `ProviderResponse` object. The `ProviderResponse` object format:

```javascript
{
  // main response shown to users
  output: "Model response - can be text or structured data",
  error: "Error message if applicable",
  tokenUsage: {
    total: 100,
    prompt: 50,
    completion: 50,
  },
  cost: 0.002,
  cached: false,
  metadata: {}, // Additional data
  ...
}
```

### Context Parameter

The `context` parameter contains:

```javascript
{
  vars: {}, // Test case variables
  prompt: {}, // Original prompt template
  originalProvider: {}, // Used when provider is overridden
  logger: {} // Winston logger instance
}
```

### Two-Stage Provider

```javascript title="twoStageProvider.js"
const promptfoo = require('promptfoo').default;

module.exports = class TwoStageProvider {
  constructor(options) {
    this.providerId = options.id || 'two-stage';
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    // First stage: fetch additional data
    const secretData = await this.fetchSecret(this.config.secretKey);

    // Second stage: call LLM with enriched prompt
    const enrichedPrompt = `${prompt}\nContext: ${secretData}`;
    const llmResponse = await this.callLLM(enrichedPrompt);

    return {
      output: llmResponse.output,
      metadata: { secretUsed: true },
    };
  }

  async fetchSecret(key) {
    // Fetch some external data needed for processing
    return `Secret information for ${key}`;
  }

  async callLLM(prompt) {
    const { data } = await promptfoo.cache.fetchWithCache(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    );

    return {
      output: data.choices[0].message.content,
    };
  }
};
```

### TypeScript Implementation

```typescript title="typedProvider.ts"
import promptfoo from 'promptfoo';
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from 'promptfoo';

export default class TypedProvider implements ApiProvider {
  protected providerId: string;
  public config: Record<string, any>;

  constructor(options: ProviderOptions) {
    this.providerId = options.id || 'typed-provider';
    this.config = options.config || {};
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const username = (context?.vars?.username as string) || 'anonymous';

    return {
      output: `Hello, ${username}! You said: "${prompt}"`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}
```

## Additional Capabilities

### Embeddings API

```javascript title="embeddingProvider.js"
async callEmbeddingApi(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  const data = await response.json();

  return {
    embedding: data.data[0].embedding,
    tokenUsage: {
      total: data.usage.total_tokens,
      prompt: data.usage.prompt_tokens,
      completion: 0,
    },
  };
}
```

### Classification API

```javascript title="classificationProvider.js"
async callClassificationApi(text) {
  return {
    classification: {
      positive: 0.75,
      neutral: 0.20,
      negative: 0.05,
    },
  };
}
```

## Cache System

The built-in caching system helps avoid redundant API calls:

```javascript title="cacheExample.js"
// Get the cache instance
const cache = promptfoo.cache.getCache();

// Store and retrieve data
await cache.set('my-key', 'cached-value', { ttl: 3600 }); // TTL in seconds
const value = await cache.get('my-key');

// Fetch with cache wrapper
const { data, cached } = await promptfoo.cache.fetchWithCache(
  'https://api.example.com/endpoint',
  {
    method: 'POST',
    body: JSON.stringify({ query: 'data' }),
  },
  5000, // timeout in ms
);
```

## Configuration

### Provider Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: file://./myProvider.js
    label: 'My Custom API' # Display name in UI
    config:
      model: 'gpt-4o'
      temperature: 0.7
      max_tokens: 2000
      custom_parameter: 'custom value'
```

### Multiple Instances

```yaml title="multiple-providers.yaml"
providers:
  - id: file:///path/to/provider.js
    label: high-temperature
    config:
      temperature: 0.9
  - id: file:///path/to/provider.js
    label: low-temperature
    config:
      temperature: 0.1
```

## See Also

- [Browser Provider](/docs/providers/browser/)
- [Custom Provider Examples](https://github.com/promptfoo/promptfoo/tree/main/examples)
- [Custom Script Provider](/docs/providers/custom-script/)
- [Go Provider](/docs/providers/go/)
- [HTTP Provider](/docs/providers/http/)
- [Python Provider](/docs/providers/python/)
