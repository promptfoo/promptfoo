---
title: 'Interface: CallApiContextParams'
description: 'Runtime context passed to custom provider functions.'
---

## Import

```ts
import type { CallApiContextParams } from 'promptfoo';
```

Defined in: [types/providers.ts:197](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L197)

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

Defined in: [types/providers.ts:220](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L220)

Whether this call should bypass reusable response cache entries.

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:216](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L216)

Whether the caller requested debug behavior.

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:228](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L228)

Eval identifier for manual correlation across provider calls.

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:199](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L199)

Nunjucks filters available while rendering related prompt content.

---

### getCache?

> `optional` **getCache?**: () => `any`

Defined in: [types/providers.ts:206](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L206)

Accessor for the active cache instance. Treat the return value as opaque
and prefer the documented `cache.*` helpers from the package over calling
it directly.

#### Returns

`any`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:208](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L208)

Logger configured for the current eval.

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:210](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L210)

Original provider when this call is being graded or wrapped.

---

### prompt

> **prompt**: [`Prompt`](Prompt.md)

Defined in: [types/providers.ts:212](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L212)

Prompt object for the current provider call.

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:240](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L240)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:242](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L242)

Zero-based repeat index when the same test case is executed repeatedly.

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:218](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L218)

Test case currently being executed, when available to the caller.

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:230](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L230)

Stable id for the current test case when one has been assigned.

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:235](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L235)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:223](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L223)

W3C Trace Context `traceparent` header for downstream propagation.

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:225](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L225)

W3C Trace Context `tracestate` header for downstream propagation.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:214](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L214)

Rendered variables for the current test case.
