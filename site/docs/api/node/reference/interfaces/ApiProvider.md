[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L146)

Provider object shape accepted by the Node.js API.

## Properties

### callApi

> **callApi**: `CallApiFunction`

Defined in: [types/providers.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L148)

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>

Defined in: [types/providers.ts:149](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L149)

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<`ProviderClassificationResponse`\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<`ProviderEmbeddingResponse`\>

Defined in: [types/providers.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L150)

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`ProviderEmbeddingResponse`\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:163](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L163)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:151](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L151)

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:152](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L152)

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L153)

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L147)

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:154](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L154)

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L155)

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L157)

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:156](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L156)
