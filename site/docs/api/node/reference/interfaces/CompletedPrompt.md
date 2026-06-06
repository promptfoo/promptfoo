---
title: 'Interface: CompletedPrompt'
description: 'Prompt metadata attached to completed eval results.'
---

## Import

```ts
import type { CompletedPrompt } from 'promptfoo';
```

Defined in: [types/index.ts:447](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L447)

Prompt metadata attached to completed eval results.

## Example

```ts
const prompt: CompletedPrompt = {
  raw: 'Hello {{name}}',
  label: 'Greeting',
  provider: 'custom:echo',
};
```

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [contracts/validators/prompts.ts:25](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L25)

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [contracts/validators/prompts.ts:20](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L20)

#### Deprecated

in > 0.59.0. Use `label` instead.

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [contracts/validators/prompts.ts:22](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L22)

---

### id?

> `optional` **id?**: `string`

Defined in: [contracts/validators/prompts.ts:14](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L14)

---

### label

> **label**: `string`

Defined in: [contracts/validators/prompts.ts:21](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L21)

---

### metrics?

> `optional` **metrics?**: `object`

Defined in: [types/index.ts:429](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L429)

#### assertFailCount

> **assertFailCount**: `number`

Number of individual assertions that failed.

#### assertPassCount

> **assertPassCount**: `number`

Number of individual assertions that passed.

#### cost

> **cost**: `number`

Estimated cost accumulated across provider calls for this prompt.

#### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Aggregate values for named assertion metrics.

#### namedScoresCount

> **namedScoresCount**: `Record`\<`string`, `number`\>

Number of contributions included in each named score.

#### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Sum of assertion weights contributing to each named score.

#### redteam?

> `optional` **redteam?**: `object`

Red-team pass/fail counts grouped by plugin and strategy.

##### redteam.pluginFailCount

> **pluginFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team plugin id.

##### redteam.pluginPassCount

> **pluginPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team plugin id.

##### redteam.strategyFailCount

> **strategyFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team strategy id.

##### redteam.strategyPassCount

> **strategyPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team strategy id.

#### score

> **score**: `number`

Aggregate normalized score across outputs for this prompt.

#### testErrorCount

> **testErrorCount**: `number`

Number of test rows that errored before normal grading completed.

#### testFailCount

> **testFailCount**: `number`

Number of test rows that failed assertions for this prompt.

#### testPassCount

> **testPassCount**: `number`

Number of test rows that passed for this prompt.

#### tokenUsage

> **tokenUsage**: `object` = `BaseTokenUsageSchema`

Token usage accumulated across provider calls for this prompt.

##### tokenUsage.assertions?

> `optional` **assertions?**: `object`

##### tokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### tokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### tokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.assertions.total?

> `optional` **total?**: `number`

##### tokenUsage.cached?

> `optional` **cached?**: `number`

##### tokenUsage.completion?

> `optional` **completion?**: `number`

##### tokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.total?

> `optional` **total?**: `number`

#### totalLatencyMs

> **totalLatencyMs**: `number`

Sum of provider latency for this prompt in milliseconds.

---

### provider

> **provider**: `string`

Defined in: [types/index.ts:428](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L428)

---

### raw

> **raw**: `string`

Defined in: [contracts/validators/prompts.ts:15](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L15)

---

### template?

> `optional` **template?**: `string`

Defined in: [contracts/validators/prompts.ts:16](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L16)
