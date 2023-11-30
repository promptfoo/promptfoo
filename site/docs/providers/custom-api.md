---
sidebar_position: 50
---

# Custom API Provider

To create a custom API provider, implement the `ApiProvider` interface in a separate module. Here is the interface:

```javascript
class ApiProvider {
  constructor(options: { id?: string; config: Record<string, any>});
  id: () => string;
  callApi: (prompt: string, context: { vars: Record<string, any> }) => Promise<ProviderResult>;
}
```

## Example

Here's an example of a custom API provider that returns a predefined output along with token usage:

```javascript
// customApiProvider.js
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

## Using the provider

Include the custom provider in promptfoo config:

```yaml
providers: ['./customApiProvider.js']
```

Alternatively, you can pass the path to the custom API provider directly in the CLI:

```bash
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv  -v vars.csv -r ./customApiProvider.js
```

This command will evaluate the prompts using the custom API provider and save the results to the specified CSV file.

A full working example is available in the [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-provider).

## Multiple instances of the same provider

You can instantiate multiple providers of the same type with distinct IDs. In this example, we pass a different temperature config to the provider:

```yaml
providers:
  - customProvider.js:
      id: custom-provider-hightemp
      config:
        temperature: 1.0
  - customProvider.js:
      id: custom-provider-lowtemp
      config:
        temperature: 0
```
