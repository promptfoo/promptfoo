---
title: 'Interface: AssertionValueFunctionContext'
description: 'Runtime context passed to function-valued assertions.'
---

## Import

```ts
import type { AssertionValueFunctionContext } from 'promptfoo';
```

Defined in: [types/index.ts:1072](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1072)

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

Defined in: [types/index.ts:1082](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1082)

Assertion-specific config copied from `assert[].config`.

---

### logProbs

> **logProbs**: `number`[] \| `undefined`

Defined in: [types/index.ts:1080](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1080)

Provider log probabilities, when available.

---

### prompt

> **prompt**: `string` \| `undefined`

Defined in: [types/index.ts:1074](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1074)

Rendered prompt for the current result, when available.

---

### provider

> **provider**: [`ApiProvider`](ApiProvider.md) \| `undefined`

Defined in: [types/index.ts:1084](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1084)

Provider used for the current result, when available.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md) \| `undefined`

Defined in: [types/index.ts:1086](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1086)

Full provider response for the current result.

---

### test

> **test**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:1078](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1078)

Test case currently being graded.

---

### trace?

> `optional` **trace?**: `TraceData`

Defined in: [types/index.ts:1088](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1088)

Trace data for trace-aware assertions when tracing is enabled.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/index.ts:1076](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1076)

Rendered variables for the current test case.
