---
title: 'Interface: EvaluateTableHead'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 18
---

## Import

```ts
import type { EvaluateTableHead } from 'promptfoo';
```

Defined in: types/index.ts:658

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

Defined in: types/index.ts:660

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

##### metrics.incurredCost?

> `optional` **incurredCost?**: `number`

##### metrics.namedScores

<!-- prettier-ignore -->
> **namedScores**: `Record`\<`string`, `number`\>

Aggregate values for named assertion metrics.

##### metrics.namedScoresCount

<!-- prettier-ignore -->
> **namedScoresCount**: `Record`\<`string`, `number`\>

Number of contributions included in each named score.

##### metrics.namedScoreWeights?

<!-- prettier-ignore -->
> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Sum of assertion weights contributing to each named score.

##### metrics.redteam?

> `optional` **redteam?**: `object`

Red-team pass/fail counts grouped by plugin and strategy.

##### metrics.redteam.pluginFailCount

<!-- prettier-ignore -->
> **pluginFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team plugin id.

##### metrics.redteam.pluginPassCount

<!-- prettier-ignore -->
> **pluginPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team plugin id.

##### metrics.redteam.strategyFailCount

<!-- prettier-ignore -->
> **strategyFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team strategy id.

##### metrics.redteam.strategyPassCount

<!-- prettier-ignore -->
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

##### metrics.tokenUsage.attacker?

> `optional` **attacker?**: `object`

##### metrics.tokenUsage.attacker.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.attacker.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### metrics.tokenUsage.attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### metrics.tokenUsage.attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.attacker.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.attacker.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.attacker.total?

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

##### metrics.tokenUsage.generation?

> `optional` **generation?**: `object`

##### metrics.tokenUsage.generation.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.generation.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### metrics.tokenUsage.generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### metrics.tokenUsage.generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.generation.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.generation.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.generation.total?

> `optional` **total?**: `number`

##### metrics.tokenUsage.incurredTokenUsage?

> `optional` **incurredTokenUsage?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.assertions?

> `optional` **assertions?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: ...

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: ...

Input tokens written into a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: ...

Input tokens read from a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: ...

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.incurredTokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: ...

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.assertions.total?

> `optional` **total?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.attacker?

> `optional` **attacker?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.attacker.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.attacker.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: ...

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: ...

Input tokens written into a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: ...

Input tokens read from a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.attacker.completionDetails.reasoning?

> `optional` **reasoning?**: ...

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.incurredTokenUsage.attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: ...

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.attacker.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.attacker.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.attacker.total?

> `optional` **total?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.incurredTokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.generation?

> `optional` **generation?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.generation.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.generation.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.incurredTokenUsage.generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: ...

Prediction tokens accepted by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: ...

Input tokens written into a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: ...

Input tokens read from a provider cache.

##### metrics.tokenUsage.incurredTokenUsage.generation.completionDetails.reasoning?

> `optional` **reasoning?**: ...

Tokens spent on hidden model reasoning when the provider reports them.

##### metrics.tokenUsage.incurredTokenUsage.generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: ...

Prediction tokens rejected by speculative decoding, when reported.

##### metrics.tokenUsage.incurredTokenUsage.generation.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.generation.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.generation.total?

> `optional` **total?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.incurredTokenUsage.total?

> `optional` **total?**: `number`

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

Defined in: types/index.ts:662

Variable names rendered before provider columns.
