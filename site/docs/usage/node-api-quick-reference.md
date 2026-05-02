---
sidebar_label: Node API Quick Reference
sidebar_position: 23
title: Node API quick reference
description: Quick lookup for promptfoo's Node.js API, covering common eval, provider, assertion, cache, guardrail, red team, and utility tasks.
---

# Node API Quick Reference

Quick lookup guide for the promptfoo Node module API. Find what you need fast.

## Import Statement

```typescript
import {
  // Main function
  evaluate,

  // Providers
  loadApiProvider,

  // Assertions
  assertions,

  // Caching
  cache,

  // Safety
  guardrails,

  // Adversarial testing
  redteam,

  // Types and utilities
  generateTable,
  isTransformFunction,
} from 'promptfoo';
```

---

## Most Used APIs

### 1. **`evaluate(testSuite, options?)`** ⭐

Run evaluation tests.

```typescript
await evaluate({
  prompts: ['What is 2+2?'],
  providers: ['openai:chat:gpt-5.5'],
  tests: [
    {
      vars: {},
      assert: [{ type: 'contains', value: '4' }],
    },
  ],
});
```

**Key Options:**

- `cache: boolean` - Enable/disable caching
- `maxConcurrency: number` - Parallel execution limit
- `outputPath: string` - Save results to file

---

### 2. **`assertions.runAssertion(params)`** ⭐

Test a single output.

```typescript
await assertions.runAssertion({
  assertion: { type: 'contains', value: 'yes' },
  test: { vars: { question: 'test' } },
  providerResponse: { output: 'yes, I agree' },
});
```

---

### 3. **`loadApiProvider(path, context?)`** ⭐

Load a provider.

```typescript
const provider = await loadApiProvider('openai:chat:gpt-5.5', {
  env: { OPENAI_API_KEY: process.env.KEY },
});
```

**Supported providers:**

- `openai:chat:gpt-5.5`, `openai:responses:gpt-5.5`
- `anthropic:messages:claude-opus-4-7`, `anthropic:messages:claude-sonnet-4-6`
- `vertex:claude-opus-4-7`, `bedrock:*`, `azure:chat:gpt-5.4`
- `file://./custom.js`

---

## Common Tasks

### Task: Test Multiple Providers

```typescript
const providers = await Promise.all(
  ['openai:chat:gpt-5.5', 'anthropic:messages:claude-opus-4-7'].map((providerPath) =>
    loadApiProvider(providerPath),
  ),
);

for (const p of providers) {
  const resp = await p.callApi('test');
  console.log(`${p.id()}: ${resp.output}`);
}
```

---

### Task: Custom Grading

```typescript
{
  type: 'javascript',
  value: (output, context) => ({
    pass: output.length > 50,
    score: Math.min(output.length / 100, 1),
    reason: 'Output too short'
  })
}
```

---

### Task: Save Results

```typescript
await evaluate(testSuite, {
  outputPath: 'results.json',
});
```

---

### Task: Disable Cache

```typescript
import { cache } from 'promptfoo';

cache.disableCache();
const evalRecord = await evaluate(testSuite);
cache.enableCache();
```

---

### Task: Isolate Cache

```typescript
await cache.withCacheNamespace('v1', async () => {
  return evaluate(testSuite);
});
```

---

## API by Category

### Evaluation Functions

| Function                     | Purpose                  | Stability |
| ---------------------------- | ------------------------ | --------- |
| `evaluate()`                 | Run full test suite      | ✅ Stable |
| `assertions.runAssertion()`  | Test single output       | ✅ Stable |
| `assertions.runAssertions()` | Test multiple assertions | ✅ Stable |

### Provider Functions

| Function            | Purpose           | Stability |
| ------------------- | ----------------- | --------- |
| `loadApiProvider()` | Load one provider | ✅ Stable |

### Cache Functions

| Function                     | Purpose            | Stability |
| ---------------------------- | ------------------ | --------- |
| `cache.enableCache()`        | Turn on caching    | ✅ Stable |
| `cache.disableCache()`       | Turn off caching   | ✅ Stable |
| `cache.clearCache()`         | Delete cached data | ✅ Stable |
| `cache.withCacheNamespace()` | Isolate cache      | ✅ Stable |
| `cache.fetchWithCache()`     | Cached HTTP fetch  | ✅ Stable |

### Assertion Functions

| Function                     | Purpose           | Stability |
| ---------------------------- | ----------------- | --------- |
| `assertions.runAssertion()`  | Run one assertion | ✅ Stable |
| `assertions.runAssertions()` | Run multiple      | ✅ Stable |

### Guardrails Functions

| Function             | Purpose          | Stability |
| -------------------- | ---------------- | --------- |
| `guardrails.guard()` | Moderation check | ✅ Stable |
| `guardrails.pii()`   | PII detection    | ✅ Stable |
| `guardrails.harm()`  | Harm detection   | ✅ Stable |

### Red Team Functions

| Function             | Purpose           | Stability       |
| -------------------- | ----------------- | --------------- |
| `redteam.generate()` | Generate attacks  | ⚠️ Experimental |
| `redteam.run()`      | Run red team test | ⚠️ Experimental |
| `redteam.Plugins`    | Attack plugins    | ⚠️ Experimental |
| `redteam.Strategies` | Attack strategies | ⚠️ Experimental |

### Utility Functions

| Function                | Purpose            | Stability |
| ----------------------- | ------------------ | --------- |
| `generateTable()`       | Format results     | ✅ Stable |
| `isTransformFunction()` | Check if transform | ✅ Stable |

---

## Assertion Types Quick Reference

### Basic Assertions

```typescript
// Check if output contains text
{ type: 'contains', value: 'expected text' }

// Check if output matches regex
{ type: 'regex', value: '^valid.*pattern$' }

// Check if output equals exactly
{ type: 'equals', value: 'exact match' }

// Check if output does NOT contain
{ type: 'not-contains', value: 'forbidden text' }
```

### LLM-Evaluated

```typescript
// Grade with custom rubric
{
  type: 'llm-rubric',
  value: 'Is the output helpful? 1-5.'
}

// Similarity check
{
  type: 'similarity',
  value: 'reference text',
  threshold: 0.8
}
```

### Custom Logic

```typescript
// JavaScript function
{
  type: 'javascript',
  value: (output, context) => ({
    pass: true,
    score: 0.95,
    reason: 'Custom logic passed'
  })
}
```

---

## Common Patterns

### Pattern: Generate Tests Dynamically

```typescript
const tests = dataArray.map((item) => ({
  vars: item,
  assert: [{ type: 'contains', value: item.expected }],
}));
```

### Pattern: A/B Test Models

```typescript
const v1Eval = await cache.withCacheNamespace('v1', () =>
  evaluate({ ...suite, providers: ['openai:chat:gpt-5.4'] }),
);

const v2Eval = await cache.withCacheNamespace('v2', () =>
  evaluate({ ...suite, providers: ['openai:chat:gpt-5.5'] }),
);

const v1 = await v1Eval.toEvaluateSummary();
const v2 = await v2Eval.toEvaluateSummary();
console.log(`v1: ${v1.stats.successes}, v2: ${v2.stats.successes}`);
```

### Pattern: Streaming Results

```typescript
await evaluate(testSuite, {
  onTestComplete: (result) => {
    console.log(`${result.testCase.description ?? 'test'}: ${result.success ? '✓' : '✗'}`);
  },
});
```

### Pattern: Batch Testing Providers

```typescript
const providerPaths = ['openai:chat:gpt-5.5', 'anthropic:messages:claude-opus-4-7'];
const providers = await Promise.all(
  providerPaths.map((providerPath) => loadApiProvider(providerPath)),
);

for (const p of providers) {
  const result = await p.callApi(prompt);
  const grading = await assertions.runAssertion({
    provider: p,
    assertion: {...},
    test: {...},
    providerResponse: result
  });
}
```

---

## Environment Variables

```bash
# Caching
PROMPTFOO_CACHE_ENABLED=true
PROMPTFOO_CACHE_PATH=~/.promptfoo/cache
PROMPTFOO_CACHE_TTL=604800          # Seconds (default: 14 days)
PROMPTFOO_CACHE_TYPE=disk           # or 'memory'

# Logging
LOG_LEVEL=debug                     # or 'info', 'warn', 'error'

# Disable remote features
PROMPTFOO_DISABLE_REMOTE_GENERATION=true

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Error Handling

### Common Errors

**"Provider not found"**

```typescript
// Check provider is spelled correctly
'openai:chat:gpt-5.5'; // ✓ Correct
'gpt-5.5'; // ✗ Missing provider prefix
```

**"API key required"**

```typescript
// Ensure env var is set
process.env.OPENAI_API_KEY; // Must exist

// Or pass via context
await loadApiProvider('openai:chat:gpt-5.5', {
  env: { OPENAI_API_KEY: key },
});
```

**"Cache error"**

```typescript
// Clear cache if corrupted
await cache.clearCache();

// Or disable temporarily
cache.disableCache();
```

---

## TypeScript Types

Key exported types:

```typescript
import type {
  EvaluateTestSuite,
  EvaluateOptions,
  EvaluateSummary,
  Assertion,
  ApiProvider,
  GradingResult,
} from 'promptfoo';
```

---

## Getting Help

- **API Reference**: Full documentation at `/docs/usage/node-api-reference`
- **Examples**: Advanced examples at `/docs/usage/node-api-examples`
- **Issues**: GitHub issues at https://github.com/promptfoo/promptfoo/issues
- **Discord**: Community at https://discord.gg/promptfoo

---

## Performance Tips

1. **Use caching** - Dramatically speeds up repeated evals
2. **Increase concurrency** - `maxConcurrency: 20` for parallel tests
3. **Batch operations** - Test multiple items in one eval
4. **Namespace cache** - Isolate v1 vs v2 results
5. **Stream results** - Use `onTestComplete` callback

---

## Next Steps

- Read [API Reference](/docs/usage/node-api-reference) for complete docs
- Check [Examples](/docs/usage/node-api-examples) for real-world patterns
- Try [Configuration Guide](/docs/configuration/guide) for YAML setup
