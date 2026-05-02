---
sidebar_position: 20
sidebar_label: Node.js API
title: Node.js API
description: Use promptfoo programmatically from Node.js with supported APIs for evals, providers, assertions, caching, and advanced TypeScript workflows.
---

# Using the Node.js API

The Node.js API is for cases where a static YAML config is not enough: generating
tests from code, composing providers dynamically, reusing promptfoo assertions in
another test runner, or integrating evals into an existing TypeScript
application.

If you only need a declarative eval config, start with the
[configuration guide](/docs/configuration/guide). If you need programmatic
control, import from the root `promptfoo` package. The root package entrypoint is
the supported public boundary; do not import deep files from `dist/` or `src/`.

## Install

```sh
npm install promptfoo
```

## Quickstart

```ts
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate({
  prompts: ['Answer briefly: {{question}}'],
  providers: ['openai:gpt-5-mini'],
  tests: [{ vars: { question: 'What is 2 + 2?' } }],
  writeLatestResults: true,
});

console.log(evalRecord.results);
```

`evaluate()` accepts the same core concepts as a YAML config, with additional
support for function-valued prompts, providers, assertions, and transforms. It
returns the completed eval record, including result rows and any persisted state.

## Public API map

The generated [Node.js API reference](/docs/api/node/) is the detailed source of
truth for exported symbols. The main surfaces are:

| API                                                        | Stability | Use it for                                                      |
| ---------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| `evaluate()`                                               | Stable    | Running an eval programmatically                                |
| `loadApiProvider()`                                        | Stable    | Building a provider instance before passing it into another API |
| `assertions.runAssertion()` / `assertions.runAssertions()` | Stable    | Reusing promptfoo assertion logic outside a full eval           |
| `assertions.matches*()` helpers                            | Stable    | Building Jest, Vitest, or Mocha matchers                        |
| `cache.*`                                                  | Stable    | Shared caching, cache isolation, and cached fetches             |
| `generateTable()`                                          | Stable    | Rendering eval tables in terminal-friendly text                 |
| `isTransformFunction()`                                    | Stable    | Narrowing inline transform values at runtime                    |
| `guardrails.*`                                             | Beta      | Calling promptfoo guardrail endpoints from code                 |
| `redteam.*`                                                | Beta      | Advanced red team orchestration from code                       |

Functions that are not exported from the root `promptfoo` package are not part of
the supported Node.js API, even if they exist in the repository source.

## Providers

Provider functions let you call any model or service directly from code:

```ts
import { evaluate, loadApiProvider } from 'promptfoo';

const openai = await loadApiProvider('openai:gpt-5-mini');

const evalRecord = await evaluate({
  prompts: ['Summarize: {{body}}'],
  providers: [
    openai,
    async (prompt, context) => {
      console.log('vars', context.vars);
      return { output: `Custom response for: ${prompt}` };
    },
  ],
  tests: [{ vars: { body: 'hello world' } }],
});
```

See the [provider function type](/docs/configuration/reference#providerfunction)
and the [custom provider guide](/docs/providers/custom-api) for the full provider
shape.

## Assertions

For inline custom logic, use an assertion value function:

```ts
import { evaluate } from 'promptfoo';

await evaluate({
  prompts: ['Say hello to {{name}}'],
  providers: ['openai:gpt-5-mini'],
  tests: [
    {
      vars: { name: 'Ada' },
      assert: [
        {
          type: 'javascript',
          value: (output) => ({
            pass: output.includes('Ada'),
            score: output.includes('Ada') ? 1 : 0,
            reason: output.includes('Ada') ? 'Name present' : 'Name missing',
          }),
        },
      ],
    },
  ],
});
```

For lower-level reuse, `assertions.runAssertion()` and
`assertions.runAssertions()` let you run promptfoo grading logic against a
provider response you already have. See the
[generated assertion reference](/docs/api/node/reference/variables/assertions)
and [assertions documentation](/docs/configuration/expected-outputs/).

## Transforms {#transform-functions}

When using the Node.js API, you can pass JavaScript functions directly as
`transform`, `transformVars`, or `contextTransform` values instead of string
expressions or `file://` references:

```ts
import { evaluate } from 'promptfoo';

await evaluate({
  prompts: ['What tools did you use to answer: {{question}}'],
  providers: ['openai:gpt-5-mini'],
  tests: [
    {
      vars: { question: 'What is 2 + 2?' },
      options: {
        transform: (output) => output.toUpperCase(),
      },
      assert: [
        {
          type: 'contains',
          value: 'calculator',
          transform: (output, context) => {
            const tools = context.metadata?.toolCalls ?? [];
            return tools.map((tool) => tool.name).join(', ');
          },
        },
      ],
    },
  ],
});
```

:::note

Function-valued transforms are not serializable. If you use
`writeLatestResults: true`, promptfoo replaces them with inline-function markers
in the persisted config. Use string expressions or `file://` references when you
need a stored eval to be fully reproducible later.

:::

## Caching and persistence

Disable response caching per eval with runtime options:

```ts
import { evaluate } from 'promptfoo';

await evaluate(testSuite, { cache: false });
```

For custom providers and advanced integrations, use the documented cache helpers
from `promptfoo.cache`, including `fetchWithCache()` and `withCacheNamespace()`.
See [caching](/docs/configuration/caching) and the
[cache reference](/docs/api/node/reference/promptfoo/namespaces/cache/).

Persist evals for the local web UI with `writeLatestResults: true`, or write an
output file with `outputPath` in the eval config:

```ts
await evaluate({
  prompts: ['Your prompt here'],
  providers: ['openai:gpt-5-mini'],
  tests: [{ vars: { input: 'test' } }],
  writeLatestResults: true,
  outputPath: 'results.json',
});
```

To create a shareable URL, combine `writeLatestResults: true` with
`sharing: true`. See [sharing results](/docs/usage/sharing).

## Examples

- [JavaScript example](https://github.com/promptfoo/promptfoo/tree/main/examples/config-node-package)
- [TypeScript example](https://github.com/promptfoo/promptfoo/tree/main/examples/config-node-package-typescript)
- [Jest and Vitest integration](/docs/integrations/jest)
- [Mocha and Chai integration](/docs/integrations/mocha-chai)

## Next steps

- Browse the [Node.js API reference](/docs/api/node/)
- Read [Assertions & metrics](/docs/configuration/expected-outputs/)
- Learn how to build [custom providers](/docs/providers/custom-api)
- Review [caching behavior](/docs/configuration/caching)
