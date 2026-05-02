[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiContextParams

# Interface: CallApiContextParams

Defined in: [types/providers.ts:100](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L100)

Runtime context passed to custom provider functions.

## Properties

### bustCache?

> `optional` **bustCache?**: `boolean`

Defined in: [types/providers.ts:111](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L111)

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:107](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L107)

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:118](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L118)

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:101](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L101)

---

### getCache?

> `optional` **getCache?**: `any`

Defined in: [types/providers.ts:102](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L102)

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:103](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L103)

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:104](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L104)

---

### prompt

> **prompt**: `Prompt`

Defined in: [types/providers.ts:105](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L105)

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:129](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L129)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:130](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L130)

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:110](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L110)

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:119](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L119)

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:124](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L124)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:114](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L114)

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:115](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L115)

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:106](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L106)
