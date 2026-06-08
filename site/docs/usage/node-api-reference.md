---
sidebar_label: Node API Guide
sidebar_position: 21
title: Node API guide
description: Guide to promptfoo's supported Node.js API surface, with links to generated reference pages for evals, providers, assertions, and caching.
---

import LegacyHeadingAnchors from '@site/src/components/LegacyHeadingAnchors';

# Node.js API guide

<LegacyHeadingAnchors page="reference" />

This page is the hand-written companion to the generated
[Node.js API reference](/docs/api/node/). Use this guide for orientation and the
generated reference for exact signatures.

The root `promptfoo` package entrypoint is the supported public boundary. Do not
import deep files from `dist/` or `src/`.

## Start by goal

| Goal                                       | Best first stop                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Run or embed an eval                       | [`evaluate()`](/docs/api/node/reference/functions/evaluate)                  |
| Build custom model integrations            | [`ProviderFunction`](/docs/api/node/reference/type-aliases/ProviderFunction) |
| Compare or pre-load several providers      | [`loadApiProviders()`](/docs/api/node/reference/functions/loadApiProviders)  |
| Reuse grading in Jest, Vitest, or Mocha    | [`assertions`](/docs/api/node/reference/variables/assertions)                |
| Work with inline callbacks from TypeScript | [`PromptFunction`](/docs/api/node/reference/type-aliases/PromptFunction)     |
| Tune execution rather than config          | [`EvaluateOptions`](/docs/api/node/reference/interfaces/EvaluateOptions)     |

## API map

| API                                                                               | Stability | Use it for                                          |
| --------------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| [`evaluate()`](/docs/api/node/reference/functions/evaluate)                       | Stable    | Running an eval programmatically                    |
| [`loadApiProvider()`](/docs/api/node/reference/functions/loadApiProvider)         | Stable    | Building one provider instance from code            |
| [`loadApiProviders()`](/docs/api/node/reference/functions/loadApiProviders)       | Stable    | Building one or many provider instances from config |
| [`assertions`](/docs/api/node/reference/variables/assertions)                     | Stable    | Reusing assertion logic or test-framework matchers  |
| [`cache`](/docs/api/node/reference/promptfoo/namespaces/cache/)                   | Stable    | Shared caching, cache isolation, and cached fetches |
| [`generateTable()`](/docs/api/node/reference/functions/generateTable)             | Stable    | Rendering eval tables in terminal-friendly text     |
| [`isTransformFunction()`](/docs/api/node/reference/functions/isTransformFunction) | Stable    | Narrowing inline transform values at runtime        |

The package still exports additional compatibility helpers and schema types, but
the generated reference intentionally focuses on the Node APIs we recommend
calling directly.

## Core types

| Type                                                                                     | What it tells you                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [`EvaluateTestSuite`](/docs/api/node/reference/type-aliases/EvaluateTestSuite)           | Config shape accepted by `evaluate()`               |
| [`EvaluateOptions`](/docs/api/node/reference/interfaces/EvaluateOptions)                 | Runtime-only controls passed as the second argument |
| [`ProvidersConfig`](/docs/api/node/reference/type-aliases/ProvidersConfig)               | Accepted provider input forms                       |
| [`CallApiFunction`](/docs/api/node/reference/interfaces/CallApiFunction)                 | Callback signature behind inline custom providers   |
| [`ProviderResponse`](/docs/api/node/reference/interfaces/ProviderResponse)               | Output shape returned by providers                  |
| [`AssertionValueFunction`](/docs/api/node/reference/type-aliases/AssertionValueFunction) | Inline JavaScript assertion callback                |
| [`TransformFunction`](/docs/api/node/reference/type-aliases/TransformFunction)           | Inline transform callback                           |

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
    providers: ['openai:chat:gpt-5.5'],
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
[`ProviderFunction`](/docs/api/node/reference/type-aliases/ProviderFunction),
[`CallApiFunction`](/docs/api/node/reference/interfaces/CallApiFunction), and
[`ProviderResponse`](/docs/api/node/reference/interfaces/ProviderResponse)
reference pages when implementing your own provider. Use
[`loadApiProviders()`](/docs/api/node/reference/functions/loadApiProviders)
when you need promptfoo to normalize provider config input into provider
instances for you.

For assertions, start with the task-oriented
[assertions documentation](/docs/configuration/expected-outputs/). Drop to
[`assertions.runAssertion()`](/docs/api/node/reference/variables/assertions#runassertion)
or [`assertions.runAssertions()`](/docs/api/node/reference/variables/assertions#runassertions)
when you already have a provider response and want to reuse promptfoo grading
outside a full eval run.

## Related docs

- [Using the Node.js API](/docs/usage/node-package)
- [Node API examples](/docs/usage/node-api-examples)
- [Node API quick reference](/docs/usage/node-api-quick-reference)
- [Generated Node.js API reference](/docs/api/node/)
- [Configuration reference](/docs/configuration/reference)
