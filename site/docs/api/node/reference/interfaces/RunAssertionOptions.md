---
title: 'Interface: RunAssertionOptions'
description: 'Options for runAssertion().'
---

## Import

```ts
import type { RunAssertionOptions } from 'promptfoo';
```

Defined in: [assertions/index.ts:420](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L420)

Options for `runAssertion()`.

## Example

```ts
const options: RunAssertionOptions = {
  assertion: { type: 'contains', value: 'Ada' },
  test: { vars: {} },
  providerResponse: { output: 'Hello Ada' },
};
```

## Properties

### assertion

> **assertion**: [`AssertionInput`](AssertionInput.md)

Defined in: [assertions/index.ts:426](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L426)

Assertion to run against the response.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [assertions/index.ts:434](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L434)

Latency for latency-based assertions, in milliseconds.

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [assertions/index.ts:422](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L422)

Rendered prompt for the response being graded, when available.

---

### provider?

> `optional` **provider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [assertions/index.ts:424](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L424)

Provider that produced the response, when model-graded assertions need it.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [assertions/index.ts:432](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L432)

Response to grade.

---

### test

> **test**: [`AssertionTestContext`](AssertionTestContext.md)

Defined in: [assertions/index.ts:428](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L428)

Test case context associated with the response.

---

### traceId?

> `optional` **traceId?**: `string`

Defined in: [assertions/index.ts:436](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L436)

Trace identifier for trace-aware assertions, when tracing is enabled.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `VarValue`\>

Defined in: [assertions/index.ts:430](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L430)

Rendered variables to use instead of `test.vars`, when already resolved.
