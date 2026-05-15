---
title: 'Interface: PromptMetrics'
description: 'Aggregate metrics tracked for one completed prompt.'
---

## Import

```ts
import type { PromptMetrics } from 'promptfoo';
```

Defined in: [types/index.ts:431](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L431)

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

Defined in: [types/index.ts:443](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L443)

Number of individual assertions that failed.

---

### assertPassCount

> **assertPassCount**: `number`

Defined in: [types/index.ts:441](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L441)

Number of individual assertions that passed.

---

### cost

> **cost**: `number`

Defined in: [types/index.ts:466](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L466)

Estimated cost accumulated across provider calls for this prompt.

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:449](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L449)

Aggregate values for named assertion metrics.

---

### namedScoresCount

> **namedScoresCount**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:451](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L451)

Number of contributions included in each named score.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:453](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L453)

Sum of assertion weights contributing to each named score.

---

### redteam?

> `optional` **redteam?**: `object`

Defined in: [types/index.ts:455](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L455)

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

Defined in: [types/index.ts:433](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L433)

Aggregate normalized score across outputs for this prompt.

---

### testErrorCount

> **testErrorCount**: `number`

Defined in: [types/index.ts:439](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L439)

Number of test rows that errored before normal grading completed.

---

### testFailCount

> **testFailCount**: `number`

Defined in: [types/index.ts:437](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L437)

Number of test rows that failed assertions for this prompt.

---

### testPassCount

> **testPassCount**: `number`

Defined in: [types/index.ts:435](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L435)

Number of test rows that passed for this prompt.

---

### tokenUsage

> **tokenUsage**: [`TokenUsage`](TokenUsage.md)

Defined in: [types/index.ts:447](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L447)

Token usage accumulated across provider calls for this prompt.

---

### totalLatencyMs

> **totalLatencyMs**: `number`

Defined in: [types/index.ts:445](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L445)

Sum of provider latency for this prompt in milliseconds.
