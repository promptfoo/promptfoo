---
title: 'Interface: EvaluateOptions'
description: 'Runtime-only options accepted by evaluate().'
---

## Import

```ts
import type { EvaluateOptions } from 'promptfoo';
```

Defined in: [types/index.ts:362](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L362)

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

Defined in: [types/index.ts:366](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L366)

Signal used to cancel the eval and pass cancellation through to providers.

---

### cache?

> `optional` **cache?**: `boolean`

Defined in: [types/index.ts:281](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L281)

Whether to reuse cached provider responses during the eval.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/index.ts:285](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L285)

Delay in milliseconds between provider calls.

---

### filterRange?

> `optional` **filterRange?**: `string` = `FilterRangeSchema`

Defined in: [types/index.ts:345](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L345)

Zero-based test index range in start:end format (end exclusive).
Persisted on the eval record so resume runs reproduce the original slice.

---

### generateSuggestions?

> `optional` **generateSuggestions?**: `boolean`

Defined in: [types/index.ts:290](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L290)

Whether promptfoo should generate follow-up prompt improvement suggestions
after the eval completes.

---

### ~~interactiveProviders?~~

> `optional` **interactiveProviders?**: `boolean`

Defined in: [types/index.ts:300](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L300)

#### Deprecated

This option has been removed as of 2024-08-21.

#### Remarks

Use `maxConcurrency: 1` or the CLI option `-j 1` instead to run evaluations serially.

#### Author

mldangelo

---

### isRedteam?

> `optional` **isRedteam?**: `boolean`

Defined in: [types/index.ts:335](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L335)

Marks the eval as a red team run for downstream behavior and reporting.

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [types/index.ts:304](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L304)

Maximum number of provider calls to run concurrently.

---

### maxEvalTimeMs?

> `optional` **maxEvalTimeMs?**: `number`

Defined in: [types/index.ts:331](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L331)

Maximum total runtime in milliseconds for the entire evaluation process.
When reached, all remaining tests are marked as errors and the evaluation ends.
Default is 0 (no limit).

---

### progressCallback?

> `optional` **progressCallback?**: [`EvaluateProgressCallback`](../type-aliases/EvaluateProgressCallback.md)

Defined in: [types/index.ts:311](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L311)

Callback invoked as rows finish during evaluation.

Arguments are completed-row count, total-row count, zero-based row index,
the current eval step, and aggregate metrics so far.

---

### repeat?

> `optional` **repeat?**: `number`

Defined in: [types/index.ts:315](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L315)

Number of times to repeat each test case.

---

### showProgressBar?

> `optional` **showProgressBar?**: `boolean`

Defined in: [types/index.ts:319](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L319)

Whether CLI-oriented callers should render a progress bar.

---

### silent?

> `optional` **silent?**: `boolean`

Defined in: [types/index.ts:340](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L340)

When true, suppresses informational output like "Starting evaluation" messages.
Useful for internal evaluations like provider validation.

---

### suggestionsCount?

> `optional` **suggestionsCount?**: `number`

Defined in: [types/index.ts:294](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L294)

Maximum number of prompt improvement suggestions to generate.

---

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [types/index.ts:325](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L325)

Timeout in milliseconds for each individual test case/provider API call.
When reached, that specific test is marked as an error.
Default is 0 (no timeout).
