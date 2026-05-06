[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiContextParams

# Interface: CallApiContextParams

Defined in: [types/providers.ts:173](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L173)

Runtime context passed to custom provider functions.

## Example

```ts
const provider: ProviderFunction = async (prompt, context) => ({
  output: `${context?.vars.user}: ${prompt}`,
  metadata: { evaluationId: context?.evaluationId },
});
```

## Properties

### bustCache?

> `optional` **bustCache?**: `boolean`

Defined in: [types/providers.ts:196](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L196)

Whether this call should bypass reusable response cache entries.

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:192](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L192)

Whether the caller requested debug behavior.

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:204](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L204)

Eval identifier for manual correlation across provider calls.

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:175](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L175)

Nunjucks filters available while rendering related prompt content.

---

### getCache?

> `optional` **getCache?**: () => `any`

Defined in: [types/providers.ts:182](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L182)

Accessor for the active cache instance. Treat the return value as opaque
and prefer the documented `cache.*` helpers from the package over calling
it directly.

#### Returns

`any`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:184](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L184)

Logger configured for the current eval.

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:186](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L186)

Original provider when this call is being graded or wrapped.

---

### prompt

> **prompt**: [`Prompt`](Prompt.md)

Defined in: [types/providers.ts:188](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L188)

Prompt object for the current provider call.

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:216](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L216)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:218](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L218)

Zero-based repeat index when the same test case is executed repeatedly.

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:194](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L194)

Test case currently being executed, when available to the caller.

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:206](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L206)

Stable id for the current test case when one has been assigned.

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:211](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L211)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:199](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L199)

W3C Trace Context `traceparent` header for downstream propagation.

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:201](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L201)

W3C Trace Context `tracestate` header for downstream propagation.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:190](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L190)

Rendered variables for the current test case.
