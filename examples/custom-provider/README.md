# custom-provider (Custom Provider Examples)

This example demonstrates how to create custom LLM providers for promptfoo. Custom providers allow you to:

- Call LLM APIs directly without built-in provider support
- Add custom authentication or request formatting
- Implement structured output with schema validation
- Integrate third-party AI SDKs (like Vercel AI SDK)
- Add custom caching, rate limiting, or retry logic

## Quick Start

Initialize this example:

```bash
npx promptfoo@latest init --example custom-provider
cd custom-provider
npm install
```

## Prerequisites

You'll need API keys depending on which example you run:

- **Basic Provider**: `OPENAI_API_KEY` - Get one from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Vercel AI SDK Provider**: `ANTHROPIC_API_KEY` - Get one from [Anthropic Console](https://console.anthropic.com/)

Set your API keys:

```bash
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
```

## Examples Overview

This directory contains two progressively advanced examples:

| Example               | Complexity   | Provider               | Output Type     | Use Case              |
| --------------------- | ------------ | ---------------------- | --------------- | --------------------- |
| `customProvider.js`   | Beginner     | OpenAI (direct)        | Plain text      | Learn provider basics |
| `vercelAiProvider.js` | Intermediate | Anthropic (via AI SDK) | Structured JSON | Production patterns   |

---

## Example 1: Basic Custom Provider

**File**: `customProvider.js`

### What It Demonstrates

This example shows the fundamentals of creating a custom provider:

1. **Provider Interface** - Implement `id()` and `callApi()` methods
2. **Direct API Calls** - Call OpenAI's API without using their SDK
3. **Built-in Caching** - Use `promptfoo.cache.fetchWithCache()` for efficient requests
4. **Token Tracking** - Extract and report token usage from API responses
5. **Config Overrides** - Accept configuration options like `temperature` and `max_tokens`

### How It Works

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

### Running the Example

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-...

# Run evaluation
promptfoo eval

# Or with explicit config
promptfoo eval -c promptfooconfig.yaml
```

### What Gets Tested

The config runs **4 test cases** (2 prompts × 2 variables):

- **Prompts**: Rephrase in French, Rephrase like a pirate
- **Variables**: "Hello world", "I'm hungry"

### Expected Output

```
✓ 4 passed, 0 failed, 0 errors (100%)
Total Tokens: 94 (62 prompt, 32 completion)
```

Example responses:

- "Rephrase this in French: Hello world" → "Bonjour le monde."
- "Rephrase this like a pirate: I'm hungry" → "Arrr, me belly be a-growlin'!"

### Configuration Options

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

---

## Example 2: Vercel AI SDK with Structured Output

**File**: `vercelAiProvider.js`

### What It Demonstrates

This advanced example shows production-ready patterns:

1. **Vercel AI SDK Integration** - Use `generateText()` with `Output.object()` for structured output
2. **Zod Schema Validation** - Enforce response structure with type safety
3. **Custom Caching** - Implement manual cache logic with `promptfoo.cache.getCache()`
4. **Cost Calculation** - Track and report actual API costs
5. **Chat Message Format** - Handle proper system/user message arrays

### Schema Definition

The example uses a Zod schema (`schemaValidation.js`) to ensure AI responses have this structure:

```typescript
{
  response: string;              // The actual answer
  confidence: number;            // 0-1 confidence score
  category: 'information' | 'instruction' | 'question' | 'other';
  metadata?: {
    language?: string;           // Detected language
    sentiment?: 'positive' | 'neutral' | 'negative';
  }
}
```

### How It Works

```javascript
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import { promptSchema } from './schemaValidation.js';

class CustomProvider {
  async callApi(prompt, context) {
    // Check cache first
    const cache = await promptfoo.cache.getCache();
    const cached = await cache.get(cacheKey);
    if (cached) return { output: JSON.parse(cached), cost: 0 };

    // Generate structured output using modern Vercel AI SDK approach
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      messages: JSON.parse(prompt),
      maxTokens: 4096,
      temperature: 0.4,
      output: Output.object({ schema: promptSchema }),
    });

    const { object, usage } = result;

    // Calculate cost
    const cost = (usage.inputTokens * 0.00025) / 1000 + (usage.outputTokens * 0.00125) / 1000;

    // Cache and return
    await cache.set(cacheKey, JSON.stringify(object));
    return {
      output: object,
      tokenUsage: {
        /* ... */
      },
      cost,
    };
  }
}
```

### Running the Example

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run evaluation
promptfoo eval -c promptfooconfig-vercel-ai.yaml
```

### What Gets Tested

The config runs **2 test cases**:

- "What is the capital of France?"
- "Explain photosynthesis briefly."

### Expected Output

```
✓ 2 passed, 0 failed, 0 errors (100%)
Total Tokens: 735 (611 prompt, 124 completion)
```

Example structured response:

```json
{
  "response": "The capital of France is Paris.",
  "confidence": 1,
  "category": "information",
  "metadata": {
    "language": "en",
    "sentiment": "neutral"
  }
}
```

**Cost tracking**: ~$0.004 per request (varies based on response length)

### Benefits of Structured Output

- **Type Safety**: Zod validates the schema at runtime
- **Consistency**: Every response has the same structure
- **Extractable Metadata**: Capture confidence, sentiment, categories automatically
- **Downstream Processing**: Easy to parse and use in applications

---

## File Structure

```
examples/custom-provider/
├── customProvider.js              # Basic provider example
├── vercelAiProvider.js            # Vercel AI SDK provider
├── schemaValidation.js            # Zod schema for structured output
├── promptfooconfig.yaml           # Config for basic provider
├── promptfooconfig-vercel-ai.yaml # Config for Vercel AI provider
├── prompts.txt                    # Prompt templates (basic example)
├── vars.csv                       # Test variables (basic example)
├── package.json                   # Dependencies
└── README.md                      # This file
```

All files use **ES modules** (ESM) with `"type": "module"` in `package.json`.

---

## Key Concepts

### Provider Interface

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

### Caching Strategies

**Built-in Cache** (Example 1):

```javascript
const { data, cached } = await promptfoo.cache.fetchWithCache(url, options);
```

- Automatic HTTP-level caching
- No manual cache management
- Best for simple providers

**Manual Cache** (Example 2):

```javascript
const cache = await promptfoo.cache.getCache();
const cached = await cache.get(key);
await cache.set(key, value);
```

- Full control over cache keys
- Can cache processed/structured data
- Best for complex transformations

### Token Usage

Different AI SDKs use different property names:

| SDK           | Prompt Tokens   | Completion Tokens   | Total Tokens   |
| ------------- | --------------- | ------------------- | -------------- |
| OpenAI API    | `prompt_tokens` | `completion_tokens` | `total_tokens` |
| Vercel AI SDK | `inputTokens`   | `outputTokens`      | `totalTokens`  |
| Anthropic API | `input_tokens`  | `output_tokens`     | N/A (sum them) |

Always normalize to promptfoo's format:

```javascript
{
  total: number,
  prompt: number,
  completion: number
}
```

---

## Troubleshooting

### "Cannot find module" errors

Make sure you've installed dependencies:

```bash
npm install
```

### "Invalid API key" or authentication errors

Verify your API keys are set:

```bash
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY
```

### "Schema validation failed"

The Vercel AI SDK example requires the LLM to return JSON matching the schema. If validation fails:

- Check that your schema is not too restrictive
- Ensure the model supports structured output (Claude Haiku does)
- Try increasing `maxTokens` if responses are cut off

### Cache issues

To disable cache during testing:

```bash
promptfoo eval --no-cache
```

To clear the cache:

```bash
rm -rf ~/.cache/promptfoo
```

---

## Next Steps

After exploring these examples, you can:

1. **Modify the schemas** - Change `schemaValidation.js` to match your use case
2. **Add assertions** - Use promptfoo's assertion system to validate outputs
3. **Try other models** - Swap in different LLM providers
4. **Add authentication** - Implement custom auth headers or signing
5. **Build production providers** - Use these patterns in your applications

## Related Documentation

- [Custom Providers Guide](https://promptfoo.dev/docs/providers/custom-api/)
- [Provider Configuration](https://promptfoo.dev/docs/configuration/providers/)
- [Vercel AI SDK Docs](https://ai-sdk.dev/)
- [Zod Documentation](https://zod.dev/)

---

## License

MIT
