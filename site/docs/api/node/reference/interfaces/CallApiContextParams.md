[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiContextParams

# Interface: CallApiContextParams

Defined in: [types/providers.ts:108](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L108)

Runtime context passed to custom provider functions.

## Properties

### bustCache?

> `optional` **bustCache?**: `boolean`

Defined in: [types/providers.ts:126](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L126)

Whether this call should bypass reusable response cache entries.

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:122](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L122)

Whether the caller requested debug behavior.

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:134](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L134)

Eval identifier for manual correlation across provider calls.

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:110](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L110)

Nunjucks filters available while rendering related prompt content.

---

### getCache?

> `optional` **getCache?**: `any`

Defined in: [types/providers.ts:112](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L112)

Accessor for the active cache instance.

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:114](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L114)

Logger configured for the current eval.

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:116](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L116)

Original provider when this call is being graded or wrapped.

---

### prompt

> **prompt**: `Prompt`

Defined in: [types/providers.ts:118](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L118)

Prompt object for the current provider call.

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L146)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L148)

Zero-based repeat index when the same test case is executed repeatedly.

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:124](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L124)

Test case currently being executed, when available to the caller.

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:136](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L136)

Stable id for the current test case when one has been assigned.

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:141](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L141)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:129](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L129)

W3C Trace Context `traceparent` header for downstream propagation.

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:131](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L131)

W3C Trace Context `tracestate` header for downstream propagation.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:120](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L120)

Rendered variables for the current test case.
