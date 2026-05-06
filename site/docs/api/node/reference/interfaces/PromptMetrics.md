[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptMetrics

# Interface: PromptMetrics

Defined in: [types/index.ts:440](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L440)

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

Defined in: [types/index.ts:452](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L452)

Number of individual assertions that failed.

---

### assertPassCount

> **assertPassCount**: `number`

Defined in: [types/index.ts:450](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L450)

Number of individual assertions that passed.

---

### cost

> **cost**: `number`

Defined in: [types/index.ts:475](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L475)

Estimated cost accumulated across provider calls for this prompt.

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:458](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L458)

Aggregate values for named assertion metrics.

---

### namedScoresCount

> **namedScoresCount**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:460](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L460)

Number of contributions included in each named score.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:462](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L462)

Sum of assertion weights contributing to each named score.

---

### redteam?

> `optional` **redteam?**: `object`

Defined in: [types/index.ts:464](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L464)

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

Defined in: [types/index.ts:442](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L442)

Aggregate normalized score across outputs for this prompt.

---

### testErrorCount

> **testErrorCount**: `number`

Defined in: [types/index.ts:448](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L448)

Number of test rows that errored before normal grading completed.

---

### testFailCount

> **testFailCount**: `number`

Defined in: [types/index.ts:446](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L446)

Number of test rows that failed assertions for this prompt.

---

### testPassCount

> **testPassCount**: `number`

Defined in: [types/index.ts:444](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L444)

Number of test rows that passed for this prompt.

---

### tokenUsage

> **tokenUsage**: [`TokenUsage`](TokenUsage.md)

Defined in: [types/index.ts:456](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L456)

Token usage accumulated across provider calls for this prompt.

---

### totalLatencyMs

> **totalLatencyMs**: `number`

Defined in: [types/index.ts:454](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L454)

Sum of provider latency for this prompt in milliseconds.
