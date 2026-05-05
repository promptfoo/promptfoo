[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiContextParams

# Interface: CallApiContextParams

Defined in: [types/providers.ts:116](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L116)

Runtime context passed to custom provider functions.

## Properties

### bustCache?

> `optional` **bustCache?**: `boolean`

Defined in: [types/providers.ts:139](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L139)

Whether this call should bypass reusable response cache entries.

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L135)

Whether the caller requested debug behavior.

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L147)

Eval identifier for manual correlation across provider calls.

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:118](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L118)

Nunjucks filters available while rendering related prompt content.

---

### getCache?

> `optional` **getCache?**: () => `any`

Defined in: [types/providers.ts:125](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L125)

Accessor for the active cache instance. Treat the return value as opaque
and prefer the documented `cache.*` helpers from the package over calling
it directly.

#### Returns

`any`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:127](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L127)

Logger configured for the current eval.

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:129](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L129)

Original provider when this call is being graded or wrapped.

---

### prompt

> **prompt**: `Prompt`

Defined in: [types/providers.ts:131](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L131)

Prompt object for the current provider call.

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:159](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L159)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:161](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L161)

Zero-based repeat index when the same test case is executed repeatedly.

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:137](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L137)

Test case currently being executed, when available to the caller.

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:149](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L149)

Stable id for the current test case when one has been assigned.

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:154](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L154)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:142](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L142)

W3C Trace Context `traceparent` header for downstream propagation.

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:144](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L144)

W3C Trace Context `tracestate` header for downstream propagation.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:133](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L133)

Rendered variables for the current test case.
