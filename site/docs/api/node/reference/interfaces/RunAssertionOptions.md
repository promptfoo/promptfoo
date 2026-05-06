---
title: 'Interface: RunAssertionOptions'
---

Defined in: [assertions/index.ts:417](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L417)

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

Defined in: [assertions/index.ts:423](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L423)

Assertion to run against the response.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [assertions/index.ts:431](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L431)

Latency for latency-based assertions, in milliseconds.

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [assertions/index.ts:419](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L419)

Rendered prompt for the response being graded, when available.

---

### provider?

> `optional` **provider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [assertions/index.ts:421](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L421)

Provider that produced the response, when model-graded assertions need it.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [assertions/index.ts:429](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L429)

Response to grade.

---

### test

> **test**: [`AssertionTestContext`](AssertionTestContext.md)

Defined in: [assertions/index.ts:425](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L425)

Test case context associated with the response.

---

### traceId?

> `optional` **traceId?**: `string`

Defined in: [assertions/index.ts:433](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L433)

Trace identifier for trace-aware assertions, when tracing is enabled.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `VarValue`\>

Defined in: [assertions/index.ts:427](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L427)

Rendered variables to use instead of `test.vars`, when already resolved.
