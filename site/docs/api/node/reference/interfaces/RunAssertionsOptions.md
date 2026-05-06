[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RunAssertionsOptions

# Interface: RunAssertionsOptions

Defined in: [assertions/index.ts:734](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L734)

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

> `optional` **assertScoringFunction?**: `ScoringFunction`

Defined in: [assertions/index.ts:736](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L736)

Custom aggregation function for assertion results, when needed.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [assertions/index.ts:738](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L738)

Latency for latency-based assertions, in milliseconds.

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [assertions/index.ts:740](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L740)

Rendered prompt for the response being graded, when available.

---

### provider?

> `optional` **provider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [assertions/index.ts:742](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L742)

Provider that produced the response, when model-graded assertions need it.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [assertions/index.ts:744](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L744)

Response to grade.

---

### test

> **test**: [`AssertionTestContext`](AssertionTestContext.md)

Defined in: [assertions/index.ts:746](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L746)

Test case containing the assertions to run.

---

### traceId?

> `optional` **traceId?**: `string`

Defined in: [assertions/index.ts:750](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L750)

Trace identifier for trace-aware assertions, when tracing is enabled.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `VarValue`\>

Defined in: [assertions/index.ts:748](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L748)

Rendered variables to use instead of `test.vars`, when already resolved.
