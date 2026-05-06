[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RunAssertionsOptions

# Interface: RunAssertionsOptions

Defined in: [assertions/index.ts:698](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L698)

Options for `runAssertions()`.

## Properties

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `ScoringFunction`

Defined in: [assertions/index.ts:700](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L700)

Custom aggregation function for assertion results, when needed.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [assertions/index.ts:702](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L702)

Latency for latency-based assertions, in milliseconds.

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [assertions/index.ts:704](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L704)

Rendered prompt for the response being graded, when available.

---

### provider?

> `optional` **provider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [assertions/index.ts:706](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L706)

Provider that produced the response, when model-graded assertions need it.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [assertions/index.ts:708](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L708)

Response to grade.

---

### test

> **test**: [`AssertionTestContext`](AssertionTestContext.md)

Defined in: [assertions/index.ts:710](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L710)

Test case containing the assertions to run.

---

### traceId?

> `optional` **traceId?**: `string`

Defined in: [assertions/index.ts:714](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L714)

Trace identifier for trace-aware assertions, when tracing is enabled.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `VarValue`\>

Defined in: [assertions/index.ts:712](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L712)

Rendered variables to use instead of `test.vars`, when already resolved.
