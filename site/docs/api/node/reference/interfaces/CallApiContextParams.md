---
title: 'Interface: CallApiContextParams'
description: 'Runtime context passed to custom provider functions. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 9
---

## Import

```ts
import type { CallApiContextParams } from 'promptfoo';
```

Defined in: [src/types/providers.ts:187](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L187)

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

Defined in: [src/types/providers.ts:210](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L210)

Whether this call should bypass reusable response cache entries.

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [src/types/providers.ts:206](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L206)

Whether the caller requested debug behavior.

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [src/types/providers.ts:218](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L218)

Eval identifier for manual correlation across provider calls.

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [src/types/providers.ts:189](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L189)

Nunjucks filters available while rendering related prompt content.

---

### getCache?

> `optional` **getCache?**: () => `any`

Defined in: [src/types/providers.ts:196](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L196)

Accessor for the active cache instance. Treat the return value as opaque
and prefer the documented `cache.*` helpers from the package over calling
it directly.

#### Returns

`any`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [src/types/providers.ts:198](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L198)

Logger configured for the current eval.

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [src/types/providers.ts:200](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L200)

Original provider when this call is being graded or wrapped.

---

### prompt

> **prompt**: [`Prompt`](Prompt.md)

Defined in: [src/types/providers.ts:202](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L202)

Prompt object for the current provider call.

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [src/types/providers.ts:230](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L230)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [src/types/providers.ts:232](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L232)

Zero-based repeat index when the same test case is executed repeatedly.

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [src/types/providers.ts:208](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L208)

Test case currently being executed, when available to the caller.

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [src/types/providers.ts:220](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L220)

Stable id for the current test case when one has been assigned.

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [src/types/providers.ts:225](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L225)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [src/types/providers.ts:213](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L213)

W3C Trace Context `traceparent` header for downstream propagation.

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [src/types/providers.ts:215](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L215)

W3C Trace Context `tracestate` header for downstream propagation.

---

### vars

<!-- prettier-ignore -->
> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [src/types/providers.ts:204](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L204)

Rendered variables for the current test case.
