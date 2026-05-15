---
title: 'Interface: AssertionValueFunctionContext'
description: 'Runtime context passed to function-valued assertions.'
---

## Import

```ts
import type { AssertionValueFunctionContext } from 'promptfoo';
```

Defined in: [types/index.ts:1128](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1128)

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

Defined in: [types/index.ts:1138](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1138)

Assertion-specific config copied from `assert[].config`.

---

### logProbs

> **logProbs**: `number`[] \| `undefined`

Defined in: [types/index.ts:1136](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1136)

Provider log probabilities, when available.

---

### prompt

> **prompt**: `string` \| `undefined`

Defined in: [types/index.ts:1130](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1130)

Rendered prompt for the current result, when available.

---

### provider

> **provider**: [`ApiProvider`](ApiProvider.md) \| `undefined`

Defined in: [types/index.ts:1140](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1140)

Provider used for the current result, when available.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md) \| `undefined`

Defined in: [types/index.ts:1142](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1142)

Full provider response for the current result.

---

### test

> **test**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:1134](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1134)

Test case currently being graded.

---

### trace?

> `optional` **trace?**: `TraceData`

Defined in: [types/index.ts:1144](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1144)

Trace data for trace-aware assertions when tracing is enabled.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/index.ts:1132](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1132)

Rendered variables for the current test case.
