[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiContextParams

# Interface: CallApiContextParams

Defined in: [types/providers.ts:77](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L77)

## Properties

### bustCache?

> `optional` **bustCache?**: `boolean`

Defined in: [types/providers.ts:88](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L88)

---

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types/providers.ts:84](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L84)

---

### evaluationId?

> `optional` **evaluationId?**: `string`

Defined in: [types/providers.ts:95](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L95)

---

### filters?

> `optional` **filters?**: [`NunjucksFilterMap`](../type-aliases/NunjucksFilterMap.md)

Defined in: [types/providers.ts:78](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L78)

---

### getCache?

> `optional` **getCache?**: `any`

Defined in: [types/providers.ts:79](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L79)

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: [types/providers.ts:80](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L80)

---

### originalProvider?

> `optional` **originalProvider?**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/providers.ts:81](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L81)

---

### prompt

> **prompt**: [`Prompt`](Prompt.md)

Defined in: [types/providers.ts:82](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L82)

---

### promptIdx?

> `optional` **promptIdx?**: `number`

Defined in: [types/providers.ts:106](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L106)

Index of the prompt within the current evaluation (column in results table).
Used for correlating blob references and other per-result metadata.

---

### repeatIndex?

> `optional` **repeatIndex?**: `number`

Defined in: [types/providers.ts:107](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L107)

---

### test?

> `optional` **test?**: `AtomicTestCase`

Defined in: [types/providers.ts:87](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L87)

---

### testCaseId?

> `optional` **testCaseId?**: `string`

Defined in: [types/providers.ts:96](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L96)

---

### testIdx?

> `optional` **testIdx?**: `number`

Defined in: [types/providers.ts:101](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L101)

Index of the test case within the current evaluation (row in results table).
Used for correlating blob references and other per-result metadata.

---

### traceparent?

> `optional` **traceparent?**: `string`

Defined in: [types/providers.ts:91](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L91)

---

### tracestate?

> `optional` **tracestate?**: `string`

Defined in: [types/providers.ts:92](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L92)

---

### vars

> **vars**: `Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

Defined in: [types/providers.ts:83](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L83)
