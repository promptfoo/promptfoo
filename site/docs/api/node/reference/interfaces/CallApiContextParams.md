[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiContextParams

# Interface: CallApiContextParams

Defined in: [types/providers.ts:92](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L92)

Runtime context passed to custom provider functions.

## Properties

### bustCache?

> `optional` **bustCache?**: `boolean`

Defined in: [types/providers.ts:103](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L103)

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:99](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L99)

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:110](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L110)

---

### filters?

> `optional` **filters?**: `NunjucksFilterMap`

Defined in: [types/providers.ts:93](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L93)

---

### getCache?

> `optional` **getCache?**: `any`

Defined in: [types/providers.ts:94](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L94)

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:95](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L95)

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:96](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L96)

---

### prompt

> **prompt**: `Prompt`

Defined in: [types/providers.ts:97](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L97)

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:121](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L121)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:122](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L122)

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:102](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L102)

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:111](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L111)

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:116](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L116)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:106](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L106)

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:107](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L107)

---

### vars

> **vars**: `Record`\<`string`, `VarValue`\>

Defined in: [types/providers.ts:98](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L98)
