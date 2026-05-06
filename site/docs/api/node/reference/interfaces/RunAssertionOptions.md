[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RunAssertionOptions

# Interface: RunAssertionOptions

Defined in: [assertions/index.ts:392](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L392)

Options for `runAssertion()`.

## Properties

### assertion

> **assertion**: [`AssertionInput`](AssertionInput.md)

Defined in: [assertions/index.ts:398](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L398)

Assertion to run against the response.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [assertions/index.ts:406](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L406)

Latency for latency-based assertions, in milliseconds.

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [assertions/index.ts:394](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L394)

Rendered prompt for the response being graded, when available.

---

### provider?

> `optional` **provider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [assertions/index.ts:396](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L396)

Provider that produced the response, when model-graded assertions need it.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [assertions/index.ts:404](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L404)

Response to grade.

---

### test

> **test**: [`AssertionTestContext`](AssertionTestContext.md)

Defined in: [assertions/index.ts:400](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L400)

Test case context associated with the response.

---

### traceId?

> `optional` **traceId?**: `string`

Defined in: [assertions/index.ts:408](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L408)

Trace identifier for trace-aware assertions, when tracing is enabled.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `VarValue`\>

Defined in: [assertions/index.ts:402](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L402)

Rendered variables to use instead of `test.vars`, when already resolved.
