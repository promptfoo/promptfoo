---
title: 'Type Alias: EvaluateProgressCallback'
---

> **EvaluateProgressCallback** = (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`

Defined in: [types/index.ts:1242](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1242)

Progress callback invoked as rows finish during evaluation.

## Parameters

### completed

`number`

Number of rows completed so far.

### total

`number`

Total number of rows scheduled for the eval.

### index

`number`

Zero-based index of the row that just completed.

### evalStep

`RunEvalOptions`

Current evaluator step for the completed row.

### metrics

[`PromptMetrics`](../interfaces/PromptMetrics.md)

Aggregate prompt metrics accumulated so far.

## Returns

`void`

## Example

```ts
const onProgress: EvaluateProgressCallback = (completed, total) => {
  console.log(`${completed}/${total}`);
};
```
