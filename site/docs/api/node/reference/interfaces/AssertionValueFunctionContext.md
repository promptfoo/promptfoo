---
title: 'Interface: AssertionValueFunctionContext'
description: 'Runtime context passed to function-valued assertions.'
---

## Import

```ts
import type { AssertionValueFunctionContext } from 'promptfoo';
```

Defined in: [types/index.ts:1127](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1127)

Runtime context passed to function-valued assertions.

## Example

```ts
const assertion: AssertionValueFunction = (output, context) => ({
  pass: output.includes(String(context.vars.name)),
  score: output.includes(String(context.vars.name)) ? 1 : 0,
  reason: 'Checked rendered test vars',
});
```

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:1137](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1137)

Assertion-specific config copied from `assert[].config`.

---

### logProbs

> **logProbs**: `number`[] \| `undefined`

Defined in: [types/index.ts:1135](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1135)

Provider log probabilities, when available.

---

### prompt

> **prompt**: `string` \| `undefined`

Defined in: [types/index.ts:1129](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1129)

Rendered prompt for the current result, when available.

---

### provider

> **provider**: [`ApiProvider`](ApiProvider.md) \| `undefined`

Defined in: [types/index.ts:1139](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1139)

Provider used for the current result, when available.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md) \| `undefined`

Defined in: [types/index.ts:1141](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1141)

Full provider response for the current result.

---

### test

> **test**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:1133](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1133)

Test case currently being graded.

---

### trace?

> `optional` **trace?**: `TraceData`

Defined in: [types/index.ts:1143](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1143)

Trace data for trace-aware assertions when tracing is enabled.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/index.ts:1131](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1131)

Rendered variables for the current test case.
