---
title: 'Interface: CompletedPrompt'
description: 'Prompt metadata attached to completed eval results. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 13
---

## Import

```ts
import type { CompletedPrompt } from 'promptfoo';
```

Defined in: [src/types/index.ts:460](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L460)

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

Defined in: [src/contracts/validators/prompts.ts:25](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L25)

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [src/contracts/validators/prompts.ts:20](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L20)

#### Deprecated

in > 0.59.0. Use `label` instead.

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [src/contracts/validators/prompts.ts:22](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L22)

---

### id?

> `optional` **id?**: `string`

Defined in: [src/contracts/validators/prompts.ts:14](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L14)

---

### label

> **label**: `string`

Defined in: [src/contracts/validators/prompts.ts:21](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L21)

---

### metrics?

> `optional` **metrics?**: `object`

Defined in: [src/types/index.ts:442](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L442)

#### assertFailCount

> **assertFailCount**: `number`

Number of individual assertions that failed.

#### assertPassCount

> **assertPassCount**: `number`

Number of individual assertions that passed.

#### cost

> **cost**: `number`

Estimated cost accumulated across provider calls for this prompt.

#### incurredCost?

> `optional` **incurredCost?**: `number`

#### namedScores

<!-- prettier-ignore -->
> **namedScores**: `Record`\<`string`, `number`\>

Aggregate values for named assertion metrics.

#### namedScoresCount

<!-- prettier-ignore -->
> **namedScoresCount**: `Record`\<`string`, `number`\>

Number of contributions included in each named score.

#### namedScoreWeights?

<!-- prettier-ignore -->
> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Sum of assertion weights contributing to each named score.

#### redteam?

> `optional` **redteam?**: `object`

Red-team pass/fail counts grouped by plugin and strategy.

##### redteam.pluginFailCount

<!-- prettier-ignore -->
> **pluginFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team plugin id.

##### redteam.pluginPassCount

<!-- prettier-ignore -->
> **pluginPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team plugin id.

##### redteam.strategyFailCount

<!-- prettier-ignore -->
> **strategyFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team strategy id.

##### redteam.strategyPassCount

<!-- prettier-ignore -->
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

##### tokenUsage.attacker?

> `optional` **attacker?**: `object`

##### tokenUsage.attacker.cached?

> `optional` **cached?**: `number`

##### tokenUsage.attacker.completion?

> `optional` **completion?**: `number`

##### tokenUsage.attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.attacker.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.attacker.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.attacker.total?

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

##### tokenUsage.generation?

> `optional` **generation?**: `object`

##### tokenUsage.generation.cached?

> `optional` **cached?**: `number`

##### tokenUsage.generation.completion?

> `optional` **completion?**: `number`

##### tokenUsage.generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.generation.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.generation.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.generation.total?

> `optional` **total?**: `number`

##### tokenUsage.incurredTokenUsage?

> `optional` **incurredTokenUsage?**: `object`

##### tokenUsage.incurredTokenUsage.assertions?

> `optional` **assertions?**: `object`

##### tokenUsage.incurredTokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### tokenUsage.incurredTokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### tokenUsage.incurredTokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.incurredTokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.incurredTokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.incurredTokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.incurredTokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.incurredTokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.incurredTokenUsage.assertions.total?

> `optional` **total?**: `number`

##### tokenUsage.incurredTokenUsage.attacker?

> `optional` **attacker?**: `object`

##### tokenUsage.incurredTokenUsage.attacker.cached?

> `optional` **cached?**: `number`

##### tokenUsage.incurredTokenUsage.attacker.completion?

> `optional` **completion?**: `number`

##### tokenUsage.incurredTokenUsage.attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.incurredTokenUsage.attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.incurredTokenUsage.attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.incurredTokenUsage.attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.incurredTokenUsage.attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.attacker.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.incurredTokenUsage.attacker.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.incurredTokenUsage.attacker.total?

> `optional` **total?**: `number`

##### tokenUsage.incurredTokenUsage.cached?

> `optional` **cached?**: `number`

##### tokenUsage.incurredTokenUsage.completion?

> `optional` **completion?**: `number`

##### tokenUsage.incurredTokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.incurredTokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.incurredTokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.incurredTokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.incurredTokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.generation?

> `optional` **generation?**: `object`

##### tokenUsage.incurredTokenUsage.generation.cached?

> `optional` **cached?**: `number`

##### tokenUsage.incurredTokenUsage.generation.completion?

> `optional` **completion?**: `number`

##### tokenUsage.incurredTokenUsage.generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### tokenUsage.incurredTokenUsage.generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### tokenUsage.incurredTokenUsage.generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### tokenUsage.incurredTokenUsage.generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### tokenUsage.incurredTokenUsage.generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### tokenUsage.incurredTokenUsage.generation.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.incurredTokenUsage.generation.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.incurredTokenUsage.generation.total?

> `optional` **total?**: `number`

##### tokenUsage.incurredTokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### tokenUsage.incurredTokenUsage.prompt?

> `optional` **prompt?**: `number`

##### tokenUsage.incurredTokenUsage.total?

> `optional` **total?**: `number`

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

Defined in: [src/types/index.ts:441](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L441)

---

### raw

> **raw**: `string`

Defined in: [src/contracts/validators/prompts.ts:15](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L15)

---

### template?

> `optional` **template?**: `string`

Defined in: [src/contracts/validators/prompts.ts:16](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L16)
