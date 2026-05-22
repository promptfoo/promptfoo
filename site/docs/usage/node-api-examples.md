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
  providers: ['openai:chat:gpt-5.5'],
  tests: [
    {
      vars: { text: 'Hello' },
      assert: [{ type: 'contains', value: 'Hola' }],
    },
  ],
});

const summary = await evalRecord.toEvaluateSummary();
console.log(summary.stats);
```

## Compare several providers

```ts
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate({
  prompts: ['Summarize: {{article}}'],
  providers: ['openai:chat:gpt-5.5', 'anthropic:messages:claude-opus-4-7'],
  tests: [
    {
      vars: { article: 'Long article text...' },
      assert: [{ type: 'llm-rubric', value: 'Accurate and concise' }],
    },
  ],
});

const summary = await evalRecord.toEvaluateSummary();
console.log(summary.stats);
```

## Build providers before an eval

```ts
import { loadApiProviders } from 'promptfoo';

const providers = await loadApiProviders([
  'openai:chat:gpt-5.5',
  {
    'anthropic:messages:claude-opus-4-7': {
      label: 'candidate',
    },
  },
]);

for (const provider of providers) {
  const response = await provider.callApi('Return one sentence.');
  console.log(provider.id(), response.output);
}
```

## Use an inline provider

```ts
import { evaluate } from 'promptfoo';

await evaluate({
  prompts: ['Summarize: {{body}}'],
  providers: [
    async (prompt, context) => ({
      output: `Handled "${prompt}" for ${context?.vars.body}`,
    }),
  ],
  tests: [{ vars: { body: 'hello world' } }],
});
```

## Generate prompts from code

```ts
import { evaluate, type PromptFunction } from 'promptfoo';

const prompt: PromptFunction = async ({ vars }) => ({
  prompt: `Explain ${vars.topic} to a beginner.`,
  config: { temperature: 0.2 },
});

await evaluate({
  prompts: [prompt],
  providers: ['openai:chat:gpt-5.5'],
  tests: [{ vars: { topic: 'gradient descent' } }],
});
```

## Add a custom assertion

```ts
import { evaluate } from 'promptfoo';

await evaluate({
  prompts: ['Say hello to {{name}}'],
  providers: ['openai:chat:gpt-5.5'],
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

## Run a batch of assertions

```ts
import { assertions } from 'promptfoo';

const result = await assertions.runAssertions({
  test: {
    vars: {},
    assert: [
      { type: 'contains', value: 'Ada' },
      { type: 'word-count', value: 2 },
    ],
  },
  providerResponse: { output: 'Hello Ada' },
});

console.log(result.pass, result.score);
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
  evaluate({ ...testSuite, providers: ['openai:chat:gpt-5.5'] }),
);

const candidate = await cache.withCacheNamespace('candidate', () =>
  evaluate({ ...testSuite, providers: ['openai:chat:gpt-5.5'] }),
);

const [baselineSummary, candidateSummary] = await Promise.all([
  baseline.toEvaluateSummary(),
  candidate.toEvaluateSummary(),
]);

console.log(baselineSummary.results.length, candidateSummary.results.length);
```
