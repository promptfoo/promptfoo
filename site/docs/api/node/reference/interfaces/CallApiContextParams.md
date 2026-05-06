[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiContextParams

# Interface: CallApiContextParams

Defined in: [types/providers.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L148)

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

Defined in: [types/providers.ts:171](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L171)

Whether this call should bypass reusable response cache entries.

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:167](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L167)

Whether the caller requested debug behavior.

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:179](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L179)

Eval identifier for manual correlation across provider calls.

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L150)

Nunjucks filters available while rendering related prompt content.

---

### getCache?

> `optional` **getCache?**: () => `any`

Defined in: [types/providers.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L157)

Accessor for the active cache instance. Treat the return value as opaque
and prefer the documented `cache.*` helpers from the package over calling
it directly.

#### Returns

`any`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:159](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L159)

Logger configured for the current eval.

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:161](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L161)

Original provider when this call is being graded or wrapped.

---

### prompt

> **prompt**: `Prompt`

Defined in: [types/providers.ts:163](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L163)

Prompt object for the current provider call.

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:191](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L191)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:193](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L193)

Zero-based repeat index when the same test case is executed repeatedly.

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:169](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L169)

Test case currently being executed, when available to the caller.

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:181](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L181)

Stable id for the current test case when one has been assigned.

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:186](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L186)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:174](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L174)

W3C Trace Context `traceparent` header for downstream propagation.

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:176](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L176)

W3C Trace Context `tracestate` header for downstream propagation.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:165](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L165)

Rendered variables for the current test case.
