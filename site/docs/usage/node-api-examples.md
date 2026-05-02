---
sidebar_label: Node API Examples
sidebar_position: 22
title: Node API examples
description: Practical examples for using promptfoo programmatically from Node.js, including evals, providers, assertions, progress callbacks, and cache isolation.
---

# Node.js API examples

These examples complement the [Node.js API guide](/docs/usage/node-api-reference)
and the generated [Node.js API reference](/docs/api/node/).

## Run an eval

```ts
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate({
  prompts: ['Translate to Spanish: {{text}}'],
  providers: ['openai:gpt-5-mini'],
  tests: [
    {
      vars: { text: 'Hello' },
      assert: [{ type: 'contains', value: 'Hola' }],
    },
  ],
});

console.log(evalRecord.results);
```

## Use an inline provider

```ts
import { evaluate } from 'promptfoo';

await evaluate({
  prompts: ['Summarize: {{body}}'],
  providers: [
    async (prompt, context) => ({
      output: `Handled "${prompt}" for ${context.vars.body}`,
    }),
  ],
  tests: [{ vars: { body: 'hello world' } }],
});
```

## Add a custom assertion

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

## Reuse assertion logic

```ts
import { assertions } from 'promptfoo';

const result = await assertions.runAssertion({
  assertion: { type: 'contains', value: 'Ada' },
  test: { vars: {} },
  providerResponse: { output: 'Hello Ada' },
});

console.log(result.pass);
```

## Track progress

```ts
import { evaluate } from 'promptfoo';

await evaluate(testSuite, {
  progressCallback: (completed, total, index, evalStep, metrics) => {
    console.log(
      `Finished ${completed}/${total}: row ${index + 1}, test ${evalStep.testIdx + 1}, score ${metrics.score}`,
    );
  },
});
```

`progressCallback` receives the per-row
[`RunEvalOptions`](/docs/configuration/reference#runevaloptions) context and
aggregate [`PromptMetrics`](/docs/configuration/reference#promptmetrics).

## Isolate caches

```ts
import { cache, evaluate } from 'promptfoo';

const baseline = await cache.withCacheNamespace('baseline', () =>
  evaluate({ ...testSuite, providers: ['openai:gpt-5-mini'] }),
);

const candidate = await cache.withCacheNamespace('candidate', () =>
  evaluate({ ...testSuite, providers: ['openai:gpt-5-mini'] }),
);

console.log(baseline.results.length, candidate.results.length);
```

## Use beta APIs deliberately

`guardrails.*` and `redteam.*` are beta surfaces. They are available for advanced
integrations, but prefer the CLI and documented config flows unless you need
programmatic orchestration.

```ts
import { guardrails } from 'promptfoo';

const result = await guardrails.pii('Contact me at ada@example.com');
console.log(result.results[0]?.flagged);
```

See the generated [`guardrails`](/docs/api/node/reference/variables/guardrails)
and [`redteam`](/docs/api/node/reference/variables/redteam) pages for their
current signatures.
