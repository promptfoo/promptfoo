---
sidebar_label: Node API Guide
sidebar_position: 21
title: Node API guide
description: Guide to promptfoo's supported Node.js API surface, with links to generated reference pages for evals, providers, assertions, caching, and beta APIs.
---

# Node.js API guide

This page is the hand-written companion to the generated
[Node.js API reference](/docs/api/node/). Use this guide for orientation and the
generated reference for exact signatures.

The root `promptfoo` package entrypoint is the supported public boundary. Do not
import deep files from `dist/` or `src/`.

## API map

| API                                                                               | Stability | Use it for                                          |
| --------------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| [`evaluate()`](/docs/api/node/reference/functions/evaluate)                       | Stable    | Running an eval programmatically                    |
| [`loadApiProvider()`](/docs/api/node/reference/functions/loadApiProvider)         | Stable    | Building one provider instance from code            |
| [`assertions`](/docs/api/node/reference/variables/assertions)                     | Stable    | Reusing assertion logic or test-framework matchers  |
| [`cache`](/docs/api/node/reference/promptfoo/namespaces/cache/)                   | Stable    | Shared caching, cache isolation, and cached fetches |
| [`generateTable()`](/docs/api/node/reference/functions/generateTable)             | Stable    | Rendering eval tables in terminal-friendly text     |
| [`isTransformFunction()`](/docs/api/node/reference/functions/isTransformFunction) | Stable    | Narrowing inline transform values at runtime        |
| [`guardrails`](/docs/api/node/reference/variables/guardrails)                     | Beta      | Calling promptfoo guardrail endpoints from code     |
| [`redteam`](/docs/api/node/reference/variables/redteam)                           | Beta      | Advanced red team orchestration from code           |

The package still exports additional compatibility helpers and schema types, but
the generated reference intentionally focuses on the Node APIs we recommend
calling directly.

## How the pieces fit

`evaluate()` takes an [`EvaluateTestSuite`](/docs/api/node/reference/type-aliases/EvaluateTestSuite)
plus runtime-only [`EvaluateOptions`](/docs/api/node/reference/interfaces/EvaluateOptions).
The test-suite shape follows the same concepts as YAML config, while the Node API
also accepts inline functions where the types allow them.

```ts
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate(
  {
    prompts: ['Answer briefly: {{question}}'],
    providers: ['openai:gpt-5-mini'],
    tests: [{ vars: { question: 'What is 2 + 2?' } }],
  },
  {
    cache: false,
    maxConcurrency: 2,
  },
);
```

Use [`loadApiProvider()`](/docs/api/node/reference/functions/loadApiProvider)
when you need to construct a provider once and pass it into another API. Use the
[`ProviderFunction`](/docs/api/node/reference/type-aliases/ProviderFunction)
and [`ProviderResponse`](/docs/api/node/reference/interfaces/ProviderResponse)
reference pages when implementing your own provider.

For assertions, start with the task-oriented
[assertions documentation](/docs/configuration/expected-outputs/). Drop to
[`assertions.runAssertion()`](/docs/api/node/reference/variables/assertions)
or `assertions.runAssertions()` when you already have a provider response and
want to reuse promptfoo grading outside a full eval run.

## Stable and beta surfaces

Stable APIs are intended for normal production use. Beta APIs are exported for
advanced integrations, but their shape may still change between releases.

`guardrails.*` and `redteam.*` are currently beta. Prefer the normal CLI and
configuration flows unless you specifically need programmatic orchestration.

## Related docs

- [Using the Node.js API](/docs/usage/node-package)
- [Node API examples](/docs/usage/node-api-examples)
- [Node API quick reference](/docs/usage/node-api-quick-reference)
- [Generated Node.js API reference](/docs/api/node/)
- [Configuration reference](/docs/configuration/reference)
