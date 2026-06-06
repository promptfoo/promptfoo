---
title: 'Interface: EvaluateTableHead'
description: 'Header metadata for an eval table.'
---

## Import

```ts
import type { EvaluateTableHead } from 'promptfoo';
```

Defined in: [types/index.ts:644](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L644)

Header metadata for an eval table.

`prompts` and `vars` define the visible column order used by rows in the
matching `EvaluateTable.body`.

## Example

```ts
const head: EvaluateTableHead = {
  prompts: [
    {
      raw: 'Hello {{name}}',
      label: 'Greeting',
      provider: 'custom:echo',
    },
  ],
  vars: ['name'],
};
```

## Properties

### prompts

> **prompts**: `object`[]

Defined in: [types/index.ts:646](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L646)

Completed prompts rendered as provider columns.

#### config?

> `optional` **config?**: `any`

#### ~~display?~~

> `optional` **display?**: `string`

##### Deprecated

in > 0.59.0. Use `label` instead.

#### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

#### id?

> `optional` **id?**: `string`

#### label

> **label**: `string`

#### metrics?

> `optional` **metrics?**: `object`

##### metrics.assertFailCount

> **assertFailCount**: `number`

Number of individual assertions that failed.

##### metrics.assertPassCount

> **assertPassCount**: `number`

Number of individual assertions that passed.

##### metrics.cost

> **cost**: `number`

Estimated cost accumulated across provider calls for this prompt.

##### metrics.namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Aggregate values for named assertion metrics.

##### metrics.namedScoresCount

> **namedScoresCount**: `Record`\<`string`, `number`\>

Number of contributions included in each named score.

##### metrics.namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Sum of assertion weights contributing to each named score.

##### metrics.redteam?

> `optional` **redteam?**: `object`

Red-team pass/fail counts grouped by plugin and strategy.

##### metrics.redteam.pluginFailCount

> **pluginFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team plugin id.

##### metrics.redteam.pluginPassCount

> **pluginPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team plugin id.

##### metrics.redteam.strategyFailCount

> **strategyFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team strategy id.

##### metrics.redteam.strategyPassCount

> **strategyPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team strategy id.

##### metrics.score

> **score**: `number`

Aggregate normalized score across outputs for this prompt.

##### metrics.testErrorCount

> **testErrorCount**: `number`

Number of test rows that errored before normal grading completed.

##### metrics.testFailCount

> **testFailCount**: `number`

Number of test rows that failed assertions for this prompt.

##### metrics.testPassCount

> **testPassCount**: `number`

Number of test rows that passed for this prompt.

##### metrics.tokenUsage

> **tokenUsage**: `object` = `BaseTokenUsageSchema`

Token usage accumulated across provider calls for this prompt.

##### metrics.tokenUsage.assertions?

> `optional` **assertions?**: `object`

##### metrics.tokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### metrics.tokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### metrics.tokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.assertions.total?

> `optional` **total?**: `number`

##### metrics.tokenUsage.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### metrics.tokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### metrics.tokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.total?

> `optional` **total?**: `number`

##### metrics.totalLatencyMs

> **totalLatencyMs**: `number`

Sum of provider latency for this prompt in milliseconds.

#### provider

> **provider**: `string`

#### raw

> **raw**: `string`

#### template?

> `optional` **template?**: `string`

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:648](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L648)

Variable names rendered before provider columns.
