---
title: 'Interface: CallApiContextParams'
description: 'Runtime context passed to custom provider functions.'
---

## Import

```ts
import type { CallApiContextParams } from 'promptfoo';
```

Defined in: [types/providers.ts:184](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L184)

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

Defined in: [types/providers.ts:207](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L207)

Whether this call should bypass reusable response cache entries.

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:203](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L203)

Whether the caller requested debug behavior.

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:215](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L215)

Eval identifier for manual correlation across provider calls.

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:186](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L186)

Nunjucks filters available while rendering related prompt content.

---

### getCache?

> `optional` **getCache?**: () => `any`

Defined in: [types/providers.ts:193](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L193)

Accessor for the active cache instance. Treat the return value as opaque
and prefer the documented `cache.*` helpers from the package over calling
it directly.

#### Returns

`any`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:195](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L195)

Logger configured for the current eval.

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:197](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L197)

Original provider when this call is being graded or wrapped.

---

### prompt

> **prompt**: [`Prompt`](Prompt.md)

Defined in: [types/providers.ts:199](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L199)

Prompt object for the current provider call.

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:227](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L227)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:229](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L229)

Zero-based repeat index when the same test case is executed repeatedly.

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:205](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L205)

Test case currently being executed, when available to the caller.

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:217](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L217)

Stable id for the current test case when one has been assigned.

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:222](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L222)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:210](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L210)

W3C Trace Context `traceparent` header for downstream propagation.

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:212](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L212)

W3C Trace Context `tracestate` header for downstream propagation.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:201](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L201)

Rendered variables for the current test case.
