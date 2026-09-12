---
sidebar_label: Node API Quick Reference
sidebar_position: 23
title: Node API quick reference
description: "Look up promptfoo's Node.js APIs, common TypeScript types, runtime options, and snippets for providers, assertions, caches, guardrails, and red team evals."
---

import LegacyHeadingAnchors from '@site/src/components/LegacyHeadingAnchors';

# Node.js API quick reference

<LegacyHeadingAnchors page="quickReference" section="Node.js API quick reference" />

## Import

<LegacyHeadingAnchors page="quickReference" section="Import" />

```ts
import {
  assertions,
  cache,
  evaluate,
  generateTable,
  guardrails,
  isTransformFunction,
  loadApiProvider,
  loadApiProviders,
  redteam,
} from 'promptfoo';
```

Common TypeScript imports:

```ts
import type {
  AssertionValueFunction,
  CallApiFunction,
  EvaluateOptions,
  EvaluateTestSuite,
  ProviderResponse,
  ProvidersConfig,
  TransformFunction,
} from 'promptfoo';
```

## Most-used calls

<LegacyHeadingAnchors page="quickReference" section="Most-used calls" />

| Task                        | API                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Run an eval                 | [`evaluate()`](/docs/api/node/reference/functions/evaluate)                                                      |
| Build one provider          | [`loadApiProvider()`](/docs/api/node/reference/functions/loadApiProvider)                                        |
| Build one or many providers | [`loadApiProviders()`](/docs/api/node/reference/functions/loadApiProviders)                                      |
| Run one assertion           | [`assertions.runAssertion()`](/docs/api/node/reference/variables/assertions#runassertion)                        |
| Run assertion sets          | [`assertions.runAssertions()`](/docs/api/node/reference/variables/assertions#runassertions)                      |
| Disable cache for one eval  | `evaluate(testSuite, { cache: false })`                                                                          |
| Isolate cached work         | [`cache.withCacheNamespace()`](/docs/api/node/reference/promptfoo/namespaces/cache/functions/withCacheNamespace) |
| Render a table              | [`generateTable()`](/docs/api/node/reference/functions/generateTable)                                            |
| Narrow a transform value    | [`isTransformFunction()`](/docs/api/node/reference/functions/isTransformFunction)                                |

For the beta APIs, see [guardrails](/docs/usage/node-api-reference#guardrails)
(`guard`, `pii`, `harm`, `adaptive`) and
[red team orchestration](/docs/usage/node-api-reference#red-team-orchestration)
(`redteam.generate`, `redteam.run`).

## Core types

<LegacyHeadingAnchors page="quickReference" section="Core types" />

| Type                                                                                     | Meaning                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`EvaluateTestSuite`](/docs/api/node/reference/type-aliases/EvaluateTestSuite)           | First argument to `evaluate()`               |
| [`EvaluateOptions`](/docs/api/node/reference/interfaces/EvaluateOptions)                 | Runtime-only second argument to `evaluate()` |
| [`ProvidersConfig`](/docs/api/node/reference/type-aliases/ProvidersConfig)               | Accepted provider input forms                |
| [`CallApiFunction`](/docs/api/node/reference/interfaces/CallApiFunction)                 | Inline provider callback signature           |
| [`ProviderResponse`](/docs/api/node/reference/interfaces/ProviderResponse)               | Provider return shape                        |
| [`AssertionValueFunction`](/docs/api/node/reference/type-aliases/AssertionValueFunction) | Inline assertion callback signature          |
| [`TransformFunction`](/docs/api/node/reference/type-aliases/TransformFunction)           | Inline transform callback signature          |

## Runtime options

<LegacyHeadingAnchors page="quickReference" section="Runtime options" />

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

## Environment

<LegacyHeadingAnchors page="quickReference" section="Environment" />

Set provider credentials, such as `OPENAI_API_KEY`, in the process environment before
starting your application. You can also pass an `env` map to `loadApiProvider()`.

| Variable                                   | Purpose                                 |
| ------------------------------------------ | --------------------------------------- |
| `LOG_LEVEL=debug`                          | Include diagnostic logs                 |
| `PROMPTFOO_CACHE_PATH`                     | Choose the cache directory              |
| `PROMPTFOO_CACHE_TTL`                      | Set cached-response lifetime in seconds |
| `PROMPTFOO_DISABLE_REMOTE_GENERATION=true` | Use local red team generation           |

For red team runs, pass `envPath` to load an environment file for both generation
and evaluation. See the [configuration reference](/docs/configuration/reference).

## Handling errors

<LegacyHeadingAnchors page="quickReference" section="Handling errors" />

Catch rejected API calls and inspect returned results for individual test errors:

```ts
try {
  const record = await evaluate(testSuite);
  const summary = await record.toEvaluateSummary();
  for (const result of summary.results) {
    if (result.error) console.error(result.error);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
}
```

| Problem                   | Check                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Provider cannot be loaded | Use its full provider ID, such as `openai:chat:gpt-5.5`, or check the custom provider path.  |
| API key is missing        | Set the provider's environment variable or pass it through `loadApiProvider(id, { env })`.   |
| Cache read or write fails | Check directory permissions; isolate the issue with `evaluate(testSuite, { cache: false })`. |

## Common snippets

<LegacyHeadingAnchors page="quickReference" section="Common snippets" />

```ts
const provider = await loadApiProvider('openai:chat:gpt-5.5');
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
const text = generateTable(await evalRecord.getTable());
```

## Where to go next

<LegacyHeadingAnchors page="quickReference" section="Where to go next" />

- [Node.js API guide](/docs/usage/node-api-reference)
- [Node.js API examples](/docs/usage/node-api-examples)
- [Generated Node.js API reference](/docs/api/node/)
- [Configuration reference](/docs/configuration/reference)
