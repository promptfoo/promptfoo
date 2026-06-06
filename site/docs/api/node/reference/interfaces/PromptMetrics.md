---
title: 'Interface: PromptMetrics'
description: 'Aggregate metrics tracked for one completed prompt.'
---

## Import

```ts
import type { PromptMetrics } from 'promptfoo';
```

Defined in: [types/index.ts:424](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L424)

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

Defined in: [types/index.ts:374](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L374)

Number of individual assertions that failed.

---

### assertPassCount

> **assertPassCount**: `number`

Defined in: [types/index.ts:372](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L372)

Number of individual assertions that passed.

---

### cost

> **cost**: `number`

Defined in: [types/index.ts:399](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L399)

Estimated cost accumulated across provider calls for this prompt.

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:380](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L380)

Aggregate values for named assertion metrics.

---

### namedScoresCount

> **namedScoresCount**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:382](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L382)

Number of contributions included in each named score.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:384](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L384)

Sum of assertion weights contributing to each named score.

---

### redteam?

> `optional` **redteam?**: `object`

Defined in: [types/index.ts:386](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L386)

Red-team pass/fail counts grouped by plugin and strategy.

#### pluginFailCount

> **pluginFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team plugin id.

#### pluginPassCount

> **pluginPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team plugin id.

#### strategyFailCount

> **strategyFailCount**: `Record`\<`string`, `number`\>

Failing result counts by red-team strategy id.

#### strategyPassCount

> **strategyPassCount**: `Record`\<`string`, `number`\>

Passing result counts by red-team strategy id.

---

### score

> **score**: `number`

Defined in: [types/index.ts:364](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L364)

Aggregate normalized score across outputs for this prompt.

---

### testErrorCount

> **testErrorCount**: `number`

Defined in: [types/index.ts:370](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L370)

Number of test rows that errored before normal grading completed.

---

### testFailCount

> **testFailCount**: `number`

Defined in: [types/index.ts:368](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L368)

Number of test rows that failed assertions for this prompt.

---

### testPassCount

> **testPassCount**: `number`

Defined in: [types/index.ts:366](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L366)

Number of test rows that passed for this prompt.

---

### tokenUsage

> **tokenUsage**: `object` = `BaseTokenUsageSchema`

Defined in: [types/index.ts:378](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L378)

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

#### numRequests?

> `optional` **numRequests?**: `number`

#### prompt?

> `optional` **prompt?**: `number`

#### total?

> `optional` **total?**: `number`

---

### totalLatencyMs

> **totalLatencyMs**: `number`

Defined in: [types/index.ts:376](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L376)

Sum of provider latency for this prompt in milliseconds.
