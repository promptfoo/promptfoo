---
title: 'Interface: RunAssertionsOptions'
description: 'Options for runAssertions().'
---

## Import

```ts
import type { RunAssertionsOptions } from 'promptfoo';
```

Defined in: [assertions/index.ts:737](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L737)

Options for `runAssertions()`.

## Example

```ts
const options: RunAssertionsOptions = {
  test: {
    vars: {},
    assert: [{ type: 'contains', value: 'Ada' }],
  },
  providerResponse: { output: 'Hello Ada' },
};
```

## Properties

### assertScoringFunction?

> `optional` **assertScoringFunction?**: [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [assertions/index.ts:739](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L739)

Custom aggregation function for assertion results, when needed.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [assertions/index.ts:741](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L741)

Latency for latency-based assertions, in milliseconds.

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [assertions/index.ts:743](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L743)

Rendered prompt for the response being graded, when available.

---

### provider?

> `optional` **provider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [assertions/index.ts:745](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L745)

Provider that produced the response, when model-graded assertions need it.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [assertions/index.ts:747](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L747)

Response to grade.

---

### test

> **test**: [`AssertionTestContext`](AssertionTestContext.md)

Defined in: [assertions/index.ts:749](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L749)

Test case containing the assertions to run.

---

### traceId?

> `optional` **traceId?**: `string`

Defined in: [assertions/index.ts:753](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L753)

Trace identifier for trace-aware assertions, when tracing is enabled.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `VarValue`\>

Defined in: [assertions/index.ts:751](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L751)

Rendered variables to use instead of `test.vars`, when already resolved.
