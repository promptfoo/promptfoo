---
title: 'Interface: EvaluateOptions'
description: 'Runtime-only options accepted by evaluate().'
sidebar_position: 18
---

## Import

```ts
import type { EvaluateOptions } from 'promptfoo';
```

Defined in: [types/index.ts:355](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L355)

Runtime-only options accepted by `evaluate()`.

## Example

```ts
const options: EvaluateOptions = {
  cache: false,
  maxConcurrency: 2,
  timeoutMs: 30_000,
};
```

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [types/index.ts:359](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L359)

Signal used to cancel the eval and pass cancellation through to providers.

---

### cache?

> `optional` **cache?**: `boolean`

Defined in: [types/index.ts:274](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L274)

Whether to reuse cached provider responses during the eval.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/index.ts:278](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L278)

Delay in milliseconds between provider calls.

---

### filterRange?

> `optional` **filterRange?**: `string` = `FilterRangeSchema`

Defined in: [types/index.ts:338](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L338)

Zero-based test index range in start:end format (end exclusive).
Persisted on the eval record so resume runs reproduce the original slice.

---

### generateSuggestions?

> `optional` **generateSuggestions?**: `boolean`

Defined in: [types/index.ts:283](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L283)

Whether promptfoo should generate follow-up prompt improvement suggestions
after the eval completes.

---

### ~~interactiveProviders?~~

> `optional` **interactiveProviders?**: `boolean`

Defined in: [types/index.ts:293](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L293)

#### Deprecated

This option has been removed as of 2024-08-21.

#### Remarks

Use `maxConcurrency: 1` or the CLI option `-j 1` instead to run evaluations serially.

#### Author

mldangelo

---

### isRedteam?

> `optional` **isRedteam?**: `boolean`

Defined in: [types/index.ts:328](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L328)

Marks the eval as a red team run for downstream behavior and reporting.

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [types/index.ts:297](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L297)

Maximum number of provider calls to run concurrently.

---

### maxEvalTimeMs?

> `optional` **maxEvalTimeMs?**: `number`

Defined in: [types/index.ts:324](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L324)

Maximum total runtime in milliseconds for the entire evaluation process.
When reached, all remaining tests are marked as errors and the evaluation ends.
Default is 0 (no limit).

---

### progressCallback?

> `optional` **progressCallback?**: [`EvaluateProgressCallback`](../type-aliases/EvaluateProgressCallback.md)

Defined in: [types/index.ts:304](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L304)

Callback invoked as rows finish during evaluation.

Arguments are completed-row count, total-row count, zero-based row index,
the current eval step, and aggregate metrics so far.

---

### repeat?

> `optional` **repeat?**: `number`

Defined in: [types/index.ts:308](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L308)

Number of times to repeat each test case.

---

### showProgressBar?

> `optional` **showProgressBar?**: `boolean`

Defined in: [types/index.ts:312](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L312)

Whether CLI-oriented callers should render a progress bar.

---

### silent?

> `optional` **silent?**: `boolean`

Defined in: [types/index.ts:333](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L333)

When true, suppresses informational output like "Starting evaluation" messages.
Useful for internal evaluations like provider validation.

---

### suggestionsCount?

> `optional` **suggestionsCount?**: `number`

Defined in: [types/index.ts:287](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L287)

Maximum number of prompt improvement suggestions to generate.

---

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [types/index.ts:318](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L318)

Timeout in milliseconds for each individual test case/provider API call.
When reached, that specific test is marked as an error.
Default is 0 (no timeout).
