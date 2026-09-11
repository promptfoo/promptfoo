---
title: 'Interface: PromptMetrics'
description: 'Aggregate metrics tracked for one completed prompt. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 32
---

## Import

```ts
import type { PromptMetrics } from 'promptfoo';
```

Defined in: types/index.ts:437

Aggregate metrics tracked for one completed prompt.

## Example

```ts
const metrics: PromptMetrics = {
  score: 1,
  testPassCount: 1,
  testFailCount: 0,
  testErrorCount: 0,
  assertPassCount: 1,
  assertFailCount: 0,
  totalLatencyMs: 120,
  tokenUsage: { total: 12 },
  namedScores: {},
  namedScoresCount: {},
  cost: 0,
};
```

## Properties

### assertFailCount

> **assertFailCount**: `number`

Defined in: types/index.ts:386

Number of individual assertions that failed.

---

### assertPassCount

> **assertPassCount**: `number`

Defined in: types/index.ts:384

Number of individual assertions that passed.

---

### cost

> **cost**: `number`

Defined in: types/index.ts:411

Estimated cost accumulated across provider calls for this prompt.

---

### incurredCost?

> `optional` **incurredCost?**: `number`

Defined in: types/index.ts:412

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`>>\>

Defined in: types/index.ts:392

Aggregate values for named assertion metrics.

---

### namedScoresCount

> **namedScoresCount**: `Record`\<`string`, `number`>>\>

Defined in: types/index.ts:394

Number of contributions included in each named score.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`>>\>

Defined in: types/index.ts:396

Sum of assertion weights contributing to each named score.

---

### redteam?

> `optional` **redteam?**: `object`

Defined in: types/index.ts:398

Red-team pass/fail counts grouped by plugin and strategy.

#### pluginFailCount

> **pluginFailCount**: `Record`\<`string`, `number`>>\>

Failing result counts by red-team plugin id.

#### pluginPassCount

> **pluginPassCount**: `Record`\<`string`, `number`>>\>

Passing result counts by red-team plugin id.

#### strategyFailCount

> **strategyFailCount**: `Record`\<`string`, `number`>>\>

Failing result counts by red-team strategy id.

#### strategyPassCount

> **strategyPassCount**: `Record`\<`string`, `number`>>\>

Passing result counts by red-team strategy id.

---

### score

> **score**: `number`

Defined in: types/index.ts:376

Aggregate normalized score across outputs for this prompt.

---

### testErrorCount

> **testErrorCount**: `number`

Defined in: types/index.ts:382

Number of test rows that errored before normal grading completed.

---

### testFailCount

> **testFailCount**: `number`

Defined in: types/index.ts:380

Number of test rows that failed assertions for this prompt.

---

### testPassCount

> **testPassCount**: `number`

Defined in: types/index.ts:378

Number of test rows that passed for this prompt.

---

### tokenUsage

> **tokenUsage**: `object` = `BaseTokenUsageSchema`

Defined in: types/index.ts:390

Token usage accumulated across provider calls for this prompt.

#### assertions?

> `optional` **assertions?**: `object`

##### assertions.cached?

> `optional` **cached?**: `number`

##### assertions.completion?

> `optional` **completion?**: `number`

##### assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### assertions.numRequests?

> `optional` **numRequests?**: `number`

##### assertions.prompt?

> `optional` **prompt?**: `number`

##### assertions.total?

> `optional` **total?**: `number`

#### attacker?

> `optional` **attacker?**: `object`

##### attacker.cached?

> `optional` **cached?**: `number`

##### attacker.completion?

> `optional` **completion?**: `number`

##### attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### attacker.numRequests?

> `optional` **numRequests?**: `number`

##### attacker.prompt?

> `optional` **prompt?**: `number`

##### attacker.total?

> `optional` **total?**: `number`

#### cached?

> `optional` **cached?**: `number`

#### completion?

> `optional` **completion?**: `number`

#### completionDetails?

> `optional` **completionDetails?**: `object`

##### completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

#### generation?

> `optional` **generation?**: `object`

##### generation.cached?

> `optional` **cached?**: `number`

##### generation.completion?

> `optional` **completion?**: `number`

##### generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### generation.numRequests?

> `optional` **numRequests?**: `number`

##### generation.prompt?

> `optional` **prompt?**: `number`

##### generation.total?

> `optional` **total?**: `number`

#### incurredTokenUsage?

> `optional` **incurredTokenUsage?**: `object`

##### incurredTokenUsage.assertions?

> `optional` **assertions?**: `object`

##### incurredTokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.assertions.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.attacker?

> `optional` **attacker?**: `object`

##### incurredTokenUsage.attacker.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.attacker.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.attacker.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.attacker.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.attacker.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.generation?

> `optional` **generation?**: `object`

##### incurredTokenUsage.generation.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.generation.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.generation.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.generation.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.generation.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.total?

> `optional` **total?**: `number`

#### numRequests?

> `optional` **numRequests?**: `number`

#### prompt?

> `optional` **prompt?**: `number`

#### total?

> `optional` **total?**: `number`

---

### totalLatencyMs

> **totalLatencyMs**: `number`

Defined in: types/index.ts:388

Sum of provider latency for this prompt in milliseconds.
