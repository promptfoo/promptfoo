---
sidebar_label: Node API Quick Reference
sidebar_position: 23
title: Node API quick reference
description: Quick lookup for promptfoo's supported Node.js API surface, including evals, providers, assertions, caching, and beta programmatic APIs.
---

# Node.js API quick reference

## Import

```ts
import {
  assertions,
  cache,
  evaluate,
  generateTable,
  guardrails,
  isTransformFunction,
  loadApiProvider,
  redteam,
} from 'promptfoo';
```

## Most-used calls

| Task                       | API                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Run an eval                | [`evaluate()`](/docs/api/node/reference/functions/evaluate)                                                      |
| Build one provider         | [`loadApiProvider()`](/docs/api/node/reference/functions/loadApiProvider)                                        |
| Run one assertion          | [`assertions.runAssertion()`](/docs/api/node/reference/variables/assertions)                                     |
| Run assertion sets         | [`assertions.runAssertions()`](/docs/api/node/reference/variables/assertions)                                    |
| Disable cache for one eval | `evaluate(testSuite, { cache: false })`                                                                          |
| Isolate cached work        | [`cache.withCacheNamespace()`](/docs/api/node/reference/promptfoo/namespaces/cache/functions/withCacheNamespace) |
| Render a table             | [`generateTable()`](/docs/api/node/reference/functions/generateTable)                                            |
| Narrow a transform value   | [`isTransformFunction()`](/docs/api/node/reference/functions/isTransformFunction)                                |

## Runtime options

Pass runtime-only options as the second argument to `evaluate()`:

```ts
await evaluate(testSuite, {
  cache: false,
  maxConcurrency: 2,
  timeoutMs: 30_000,
});
```

See [`EvaluateOptions`](/docs/api/node/reference/interfaces/EvaluateOptions).
Config fields such as `outputPath`, `sharing`, and `writeLatestResults` belong in
the test suite itself; see
[`EvaluateTestSuite`](/docs/api/node/reference/type-aliases/EvaluateTestSuite).

## Stable and beta

| Surface                 | Stability |
| ----------------------- | --------- |
| `evaluate()`            | Stable    |
| `loadApiProvider()`     | Stable    |
| `assertions.*`          | Stable    |
| `cache.*`               | Stable    |
| `generateTable()`       | Stable    |
| `isTransformFunction()` | Stable    |
| `guardrails.*`          | Beta      |
| `redteam.*`             | Beta      |

## Common snippets

```ts
const provider = await loadApiProvider('openai:gpt-5-mini');
const response = await provider.callApi('Hello');
```

```ts
const result = await assertions.runAssertion({
  assertion: { type: 'contains', value: 'yes' },
  test: { vars: {} },
  providerResponse: { output: 'yes' },
});
```

```ts
await cache.withCacheNamespace('candidate', () => evaluate(testSuite));
```

```ts
const text = generateTable(evalRecord.table);
```

## Where to go next

- [Node.js API guide](/docs/usage/node-api-reference)
- [Node.js API examples](/docs/usage/node-api-examples)
- [Generated Node.js API reference](/docs/api/node/)
- [Configuration reference](/docs/configuration/reference)
