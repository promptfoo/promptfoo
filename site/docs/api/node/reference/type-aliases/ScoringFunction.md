---
title: 'Type Alias: ScoringFunction'
description: 'Custom scorer used to aggregate named assertion scores for one test case.'
---

## Import

```ts
import type { ScoringFunction } from 'promptfoo';
```

> **ScoringFunction** = (`namedScores`, `context?`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\> \| [`GradingResult`](../interfaces/GradingResult.md)

Defined in: [types/index.ts:1264](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1264)

Custom scorer used to aggregate named assertion scores for one test case.

`namedScores` only contains assertions that define a `metric`, so robust
scorers should handle the empty-object case when a test mixes scored and
unscored assertions.

## Parameters

### namedScores

`Record`\<`string`, `number`\>

Named assertion scores keyed by each assertion's `metric` value.

### context?

Optional aggregation metadata for the surrounding assertion set.

#### componentResults?

[`GradingResult`](../interfaces/GradingResult.md)[]

Individual assertion results available for custom aggregation.

#### parentAssertionSet?

\{ `assertionSet`: [`AssertionSet`](../interfaces/AssertionSet.md); `index`: `number`; \}

Parent assertion-set metadata when this scorer runs inside one.

#### parentAssertionSet.assertionSet

[`AssertionSet`](../interfaces/AssertionSet.md)

Assertion set being aggregated.

#### parentAssertionSet.index

`number`

Zero-based position of the parent assertion set in the test case.

#### threshold?

`number`

Threshold applied by the surrounding assertion set, when configured.

#### tokensUsed?

\{ `completion`: `number`; `prompt`: `number`; `total`: `number`; \}

Token totals accumulated across component results.

#### tokensUsed.completion

`number`

Completion tokens used by all component results.

#### tokensUsed.prompt

`number`

Prompt tokens used by all component results.

#### tokensUsed.total

`number`

Total tokens used by all component results.

## Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\> \| [`GradingResult`](../interfaces/GradingResult.md)

## Example

```ts
const scoreAssertions: ScoringFunction = async (namedScores, context) => {
  const scores = Object.values(namedScores);
  const score = scores.length > 0 ? Math.min(...scores) : 0;

  return {
    pass: scores.length > 0 && scores.every((value) => value >= 0.8),
    score,
    reason: `Checked ${context?.componentResults?.length ?? 0} assertions`,
  };
};
```
