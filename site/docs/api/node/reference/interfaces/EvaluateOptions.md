---
title: 'Interface: EvaluateOptions'
description: 'Runtime-only options accepted by evaluate(). See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 16
---

## Import

```ts
import type { EvaluateOptions } from 'promptfoo';
```

Defined in: [src/types/index.ts:361](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L361)

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

Defined in: [src/types/index.ts:365](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L365)

Signal used to cancel the eval and pass cancellation through to providers.

---

### cache?

> `optional` **cache?**: `boolean`

Defined in: [src/types/index.ts:280](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L280)

Whether to reuse cached provider responses during the eval.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [src/types/index.ts:284](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L284)

Delay in milliseconds between provider calls.

---

### filterRange?

> `optional` **filterRange?**: `string` = `FilterRangeSchema`

Defined in: [src/types/index.ts:344](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L344)

Zero-based test index range in start:end format (end exclusive).
Persisted on the eval record so resume runs reproduce the original slice.

---

### generateSuggestions?

> `optional` **generateSuggestions?**: `boolean`

Defined in: [src/types/index.ts:289](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L289)

Whether promptfoo should generate follow-up prompt improvement suggestions
after the eval completes.

---

### ~~interactiveProviders?~~

> `optional` **interactiveProviders?**: `boolean`

Defined in: [src/types/index.ts:299](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L299)

#### Deprecated

This option has been removed as of 2024-08-21.

#### Remarks

Use `maxConcurrency: 1` or the CLI option `-j 1` instead to run evaluations serially.

#### Author

mldangelo

---

### isRedteam?

> `optional` **isRedteam?**: `boolean`

Defined in: [src/types/index.ts:334](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L334)

Marks the eval as a red team run for downstream behavior and reporting.

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [src/types/index.ts:303](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L303)

Maximum number of provider calls to run concurrently.

---

### maxEvalTimeMs?

> `optional` **maxEvalTimeMs?**: `number`

Defined in: [src/types/index.ts:330](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L330)

Maximum total runtime in milliseconds for the entire evaluation process.
When reached, all remaining tests are marked as errors and the evaluation ends.
Default is 0 (no limit).

---

### progressCallback?

> `optional` **progressCallback?**: [`EvaluateProgressCallback`](../type-aliases/EvaluateProgressCallback.md)

Defined in: [src/types/index.ts:310](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L310)

Callback invoked as rows finish during evaluation.

Arguments are completed-row count, total-row count, zero-based row index,
the current eval step, and aggregate metrics so far.

---

### repeat?

> `optional` **repeat?**: `number`

Defined in: [src/types/index.ts:314](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L314)

Number of times to repeat each test case.

---

### showProgressBar?

> `optional` **showProgressBar?**: `boolean`

Defined in: [src/types/index.ts:318](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L318)

Whether CLI-oriented callers should render a progress bar.

---

### silent?

> `optional` **silent?**: `boolean`

Defined in: [src/types/index.ts:339](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L339)

When true, suppresses informational output like "Starting evaluation" messages.
Useful for internal evaluations like provider validation.

---

### suggestionsCount?

> `optional` **suggestionsCount?**: `number`

Defined in: [src/types/index.ts:293](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L293)

Maximum number of prompt improvement suggestions to generate.

---

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [src/types/index.ts:324](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L324)

Timeout in milliseconds for each individual test case/provider API call.
When reached, that specific test is marked as an error.
Default is 0 (no timeout).
