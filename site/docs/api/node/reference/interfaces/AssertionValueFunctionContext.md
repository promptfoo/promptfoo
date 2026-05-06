---
title: 'Interface: AssertionValueFunctionContext'
---

Defined in: [types/index.ts:1065](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1065)

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

Defined in: [types/index.ts:1075](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1075)

Assertion-specific config copied from `assert[].config`.

---

### logProbs

> **logProbs**: `number`[] \| `undefined`

Defined in: [types/index.ts:1073](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1073)

Provider log probabilities, when available.

---

### prompt

> **prompt**: `string` \| `undefined`

Defined in: [types/index.ts:1067](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1067)

Rendered prompt for the current result, when available.

---

### provider

> **provider**: [`ApiProvider`](ApiProvider.md) \| `undefined`

Defined in: [types/index.ts:1077](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1077)

Provider used for the current result, when available.

---

### providerResponse

> **providerResponse**: [`ProviderResponse`](ProviderResponse.md) \| `undefined`

Defined in: [types/index.ts:1079](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1079)

Full provider response for the current result.

---

### test

> **test**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:1071](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1071)

Test case currently being graded.

---

### trace?

> `optional` **trace?**: `TraceData`

Defined in: [types/index.ts:1081](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1081)

Trace data for trace-aware assertions when tracing is enabled.

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/index.ts:1069](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1069)

Rendered variables for the current test case.
