# custom-provider (Custom Provider Example)

This example demonstrates how to create a custom LLM provider for promptfoo. Custom providers allow you to:

- Call LLM APIs directly without built-in provider support
- Add custom authentication or request formatting
- Add custom caching, rate limiting, or retry logic
- Integrate any API that returns text responses

## Quick Start

Initialize this example:

```bash
npx promptfoo@latest init --example custom-provider
cd custom-provider
```

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

Run the evaluation:

```bash
promptfoo eval
```

## What It Demonstrates

This example shows the fundamentals of creating a custom provider:

1. **Provider Interface** - Implement `id()` and `callApi()` methods
2. **Direct API Calls** - Call OpenAI's API without using their SDK
3. **Built-in Caching** - Use `promptfoo.cache.fetchWithCache()` for efficient requests
4. **Token Tracking** - Extract and report token usage from API responses
5. **Config Overrides** - Accept configuration options like `temperature` and `max_tokens`

## How It Works

```javascript
class CustomApiProvider {
  constructor(options) {
    this.providerId = options.id || 'custom provider';
    this.config = options.config; // Accepts custom config
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    // Call OpenAI API directly
    const { data } = await promptfoo.cache.fetchWithCache(
      'https://api.openai.com/v1/chat/completions',
      {
        /* request config */
      },
    );

    return {
      output: data.choices[0].message.content,
      tokenUsage: {
        /* ... */
      },
    };
  }
}
```

## What Gets Tested

The config runs **4 test cases** (2 prompts × 2 variables):

- **Prompts**: Rephrase in French, Rephrase like a pirate
- **Variables**: "Hello world", "I'm hungry"

## Expected Output

```
✓ 4 passed, 0 failed, 0 errors (100%)
Total Tokens: 94 (62 prompt, 32 completion)
```

Example responses:

- "Rephrase this in French: Hello world" → "Bonjour le monde."
- "Rephrase this like a pirate: I'm hungry" → "Arrr, me belly be a-growlin'!"

## Configuration Options

You can customize the provider in your config:

```yaml
providers:
  - id: file://customProvider.js
    label: 'High Temperature'
    config:
      temperature: 1.0
      max_tokens: 2048
  - id: file://customProvider.js
    label: 'Low Temperature'
    config:
      temperature: 0
      max_tokens: 512
```

## File Structure

```
examples/custom-provider/
├── customProvider.js       # Custom provider implementation
├── promptfooconfig.yaml    # Evaluation configuration
├── prompts.txt             # Prompt templates
├── vars.csv                # Test variables
└── README.md               # This file
```

## Provider Interface

Every custom provider must implement:

```javascript
class MyProvider {
  constructor(options) {
    this.providerId = options.id || 'my-provider';
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    // Your implementation
    return {
      output: string | object,      // Required
      tokenUsage?: {                // Optional but recommended
        total: number,
        prompt: number,
        completion: number
      },
      cost?: number,                // Optional
      cached?: boolean              // Optional
    };
  }
}

export default MyProvider;
```

## Caching

Use promptfoo's built-in cache for automatic HTTP-level caching:

```javascript
const { data, cached } = await promptfoo.cache.fetchWithCache(url, options);
```

- Automatic HTTP-level caching
- No manual cache management
- Reduces API calls during development

## Troubleshooting

### "Invalid API key" or authentication errors

Verify your API key is set:

```bash
echo $OPENAI_API_KEY
```

### Cache issues

To disable cache during testing:

```bash
promptfoo eval --no-cache
```

## Next Steps

After exploring this example, you can:

1. **Modify the API endpoint** - Point to any API that accepts prompts
2. **Add assertions** - Use promptfoo's assertion system to validate outputs
3. **Try other models** - Change the model in `customProvider.js`
4. **Add authentication** - Implement custom auth headers or signing
5. **Build production providers** - Use these patterns in your applications

## Related Documentation

- [Custom Providers Guide](https://promptfoo.dev/docs/providers/custom-api/)
- [Provider Configuration](https://promptfoo.dev/docs/configuration/providers/)

---

## License

MIT
